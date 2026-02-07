/**
 * User Follows & Direct Messages Router
 *
 * - Follow → can send up to 10 messages
 * - Mutual follow → Friend status, unlimited messages
 * - Block → prevent messages from that user
 * - Urgent messages → instant alert in chat
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { userFollows, users, directMessages, userNotifications } from "../../drizzle/schema";
import { eq, and, ne, sql, ilike, or, desc } from "drizzle-orm";

/** Check if two users mutually follow each other (= friends) */
async function isFriend(db: any, userA: number, userB: number): Promise<boolean> {
  const mutual = await db
    .select({ id: userFollows.id })
    .from(userFollows)
    .where(and(
      eq(userFollows.followerId, userB),
      eq(userFollows.followingId, userA),
      eq(userFollows.status, "active")
    ))
    .limit(1);
  return mutual.length > 0;
}

/** Count messages sent from sender to receiver */
async function getMessageCount(db: any, senderId: number, receiverId: number): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(directMessages)
    .where(and(
      eq(directMessages.senderId, senderId),
      eq(directMessages.receiverId, receiverId)
    ));
  return count;
}

const DM_LIMIT_FOLLOW = 10; // Max messages for follow (non-friend)

export const followsRouter = router({
  /**
   * Follow a user — if they already follow us, both become friends
   */
  follow: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot follow yourself" });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Check if already following
      const existing = await db
        .select()
        .from(userFollows)
        .where(and(
          eq(userFollows.followerId, ctx.user.id),
          eq(userFollows.followingId, input.userId)
        ))
        .limit(1);

      if (existing.length > 0) {
        // If was blocked, reactivate
        if (existing[0].status === "blocked") {
          await db.update(userFollows)
            .set({ status: "active" })
            .where(eq(userFollows.id, existing[0].id));
        }
        const areFriends = await isFriend(db, ctx.user.id, input.userId);
        return { success: true, alreadyFollowing: true, isFriend: areFriends };
      }

      await db.insert(userFollows).values({
        followerId: ctx.user.id,
        followingId: input.userId,
        status: "active",
      });

      // Check if mutual → friends
      const areFriends = await isFriend(db, ctx.user.id, input.userId);

      // Notify the other user
      const { createNotification } = await import("../services/notificationService");
      await createNotification({
        db,
        userId: input.userId,
        type: areFriends ? "alert" : "follow_request",
        title: areFriends
          ? `${ctx.user.name || ctx.user.email} is now your friend!`
          : `${ctx.user.name || ctx.user.email} followed you`,
        content: areFriends
          ? "You can now send unlimited messages to each other."
          : "Follow back to become friends and chat freely.",
        priority: areFriends ? "high" : "normal",
      });

      return { success: true, alreadyFollowing: false, isFriend: areFriends };
    }),

  /**
   * Unfollow a user
   */
  unfollow: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db.delete(userFollows).where(and(
        eq(userFollows.followerId, ctx.user.id),
        eq(userFollows.followingId, input.userId)
      ));

      return { success: true };
    }),

  /**
   * Block a user — prevents them from sending messages
   */
  block: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Find the follow record where they follow us
      const follow = await db
        .select()
        .from(userFollows)
        .where(and(
          eq(userFollows.followerId, input.userId),
          eq(userFollows.followingId, ctx.user.id)
        ))
        .limit(1);

      if (follow.length > 0) {
        await db.update(userFollows)
          .set({ status: "blocked" })
          .where(eq(userFollows.id, follow[0].id));
      } else {
        // Create a blocked record even if they don't follow us
        await db.insert(userFollows).values({
          followerId: input.userId,
          followingId: ctx.user.id,
          status: "blocked",
        });
      }

      return { success: true };
    }),

  /**
   * Unblock a user
   */
  unblock: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db.update(userFollows)
        .set({ status: "active" })
        .where(and(
          eq(userFollows.followerId, input.userId),
          eq(userFollows.followingId, ctx.user.id),
          eq(userFollows.status, "blocked")
        ));

      return { success: true };
    }),

  /**
   * Get users I'm following — with friend status
   */
  getFollowing: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];

    const results = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        followId: userFollows.id,
        followedAt: userFollows.createdAt,
      })
      .from(userFollows)
      .innerJoin(users, eq(users.id, userFollows.followingId))
      .where(and(
        eq(userFollows.followerId, ctx.user.id),
        eq(userFollows.status, "active")
      ));

    // Check which are mutual (friends)
    const reverseFollows = await db
      .select({ followerId: userFollows.followerId })
      .from(userFollows)
      .where(and(
        eq(userFollows.followingId, ctx.user.id),
        eq(userFollows.status, "active")
      ));
    const mutualIds = new Set(reverseFollows.map(f => f.followerId));

    return results.map(u => ({
      ...u,
      isFriend: mutualIds.has(u.id),
    }));
  }),

  /**
   * Get my followers
   */
  getFollowers: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];

    const results = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        followId: userFollows.id,
        followStatus: userFollows.status,
        followedAt: userFollows.createdAt,
      })
      .from(userFollows)
      .innerJoin(users, eq(users.id, userFollows.followerId))
      .where(eq(userFollows.followingId, ctx.user.id));

    return results;
  }),

  /**
   * Get blocked users
   */
  getBlocked: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];

    return db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
      })
      .from(userFollows)
      .innerJoin(users, eq(users.id, userFollows.followerId))
      .where(and(
        eq(userFollows.followingId, ctx.user.id),
        eq(userFollows.status, "blocked")
      ));
  }),

  /**
   * Search users to follow
   */
  searchUsers: protectedProcedure
    .input(z.object({
      query: z.string().min(1).max(100),
      limit: z.number().min(1).max(20).default(10),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];

      const searchPattern = `%${input.query}%`;

      const results = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
        })
        .from(users)
        .where(and(
          ne(users.id, ctx.user.id),
          or(
            ilike(users.name, searchPattern),
            ilike(users.email, searchPattern)
          )
        ))
        .limit(input.limit);

      // Check follow status
      const followingIds = new Set<number>();
      const friendIds = new Set<number>();
      if (results.length > 0) {
        const myFollows = await db
          .select({ followingId: userFollows.followingId })
          .from(userFollows)
          .where(and(eq(userFollows.followerId, ctx.user.id), eq(userFollows.status, "active")));
        myFollows.forEach(f => followingIds.add(f.followingId));

        const theirFollows = await db
          .select({ followerId: userFollows.followerId })
          .from(userFollows)
          .where(and(eq(userFollows.followingId, ctx.user.id), eq(userFollows.status, "active")));
        theirFollows.forEach(f => {
          if (followingIds.has(f.followerId)) friendIds.add(f.followerId);
        });
      }

      return results.map(u => ({
        ...u,
        isFollowing: followingIds.has(u.id),
        isFriend: friendIds.has(u.id),
      }));
    }),

  // ============================================================
  // Direct Messages
  // ============================================================

  /**
   * Send a direct message
   * Follow: max 10 messages, Friend: unlimited
   */
  sendMessage: protectedProcedure
    .input(z.object({
      receiverId: z.number(),
      content: z.string().min(1).max(5000),
      isUrgent: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.receiverId === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot message yourself" });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Check our follow record toward receiver
      // block() sets followerId=blockedUser, followingId=blocker, status="blocked"
      // So if receiver blocked us, our record (us→them) has status="blocked"
      const [myFollow] = await db
        .select({ status: userFollows.status })
        .from(userFollows)
        .where(and(
          eq(userFollows.followerId, ctx.user.id),
          eq(userFollows.followingId, input.receiverId),
        ))
        .limit(1);

      if (!myFollow || myFollow.status === "blocked") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: myFollow?.status === "blocked"
            ? "You cannot send messages to this user"
            : "You must follow this user to send messages",
        });
      }

      const areFriends = await isFriend(db, ctx.user.id, input.receiverId);

      // If not friends, enforce 10-message limit
      if (!areFriends) {
        const msgCount = await getMessageCount(db, ctx.user.id, input.receiverId);
        if (msgCount >= DM_LIMIT_FOLLOW) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Message limit reached (${DM_LIMIT_FOLLOW}). The user must follow you back to become friends and unlock unlimited messaging.`,
          });
        }
      }

      // Send the message
      const [msg] = await db.insert(directMessages).values({
        senderId: ctx.user.id,
        receiverId: input.receiverId,
        content: input.content,
        isUrgent: input.isUrgent,
      }).returning();

      // Create notification
      const { createNotification } = await import("../services/notificationService");
      await createNotification({
        db,
        userId: input.receiverId,
        type: input.isUrgent ? "urgent_message" as any : "direct_message" as any,
        title: input.isUrgent
          ? `Urgent from ${ctx.user.name || ctx.user.email}`
          : `Message from ${ctx.user.name || ctx.user.email}`,
        content: input.content.slice(0, 500),
        priority: input.isUrgent ? "critical" : "normal",
      });

      return { id: msg.id, success: true };
    }),

  /**
   * Get conversation with a specific user
   */
  getMessages: protectedProcedure
    .input(z.object({
      userId: z.number(),
      limit: z.number().min(1).max(100).default(50),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];

      const msgs = await db
        .select({
          id: directMessages.id,
          senderId: directMessages.senderId,
          receiverId: directMessages.receiverId,
          content: directMessages.content,
          isUrgent: directMessages.isUrgent,
          isRead: directMessages.isRead,
          createdAt: directMessages.createdAt,
        })
        .from(directMessages)
        .where(or(
          and(eq(directMessages.senderId, ctx.user.id), eq(directMessages.receiverId, input.userId)),
          and(eq(directMessages.senderId, input.userId), eq(directMessages.receiverId, ctx.user.id))
        ))
        .orderBy(desc(directMessages.createdAt))
        .limit(input.limit);

      // Mark unread messages as read
      await db.update(directMessages)
        .set({ isRead: true })
        .where(and(
          eq(directMessages.senderId, input.userId),
          eq(directMessages.receiverId, ctx.user.id),
          eq(directMessages.isRead, false)
        ));

      return msgs.reverse(); // Oldest first
    }),

  /**
   * Get unread DM count
   */
  getUnreadDmCount: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { count: 0 };

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(directMessages)
      .where(and(
        eq(directMessages.receiverId, ctx.user.id),
        eq(directMessages.isRead, false)
      ));

    return { count };
  }),

  /**
   * Get list of DM conversations (unique users with last message)
   */
  getDmConversations: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];

    // Get distinct users we've messaged with
    const sent = await db
      .select({ peerId: directMessages.receiverId })
      .from(directMessages)
      .where(eq(directMessages.senderId, ctx.user.id))
      .groupBy(directMessages.receiverId);

    const received = await db
      .select({ peerId: directMessages.senderId })
      .from(directMessages)
      .where(eq(directMessages.receiverId, ctx.user.id))
      .groupBy(directMessages.senderId);

    const peerIds = [...new Set([...sent.map(s => s.peerId), ...received.map(r => r.peerId)])];
    if (peerIds.length === 0) return [];

    // Get user info + last message + unread count for each peer
    const conversations = [];
    for (const peerId of peerIds) {
      const [user] = await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, peerId))
        .limit(1);

      const [lastMsg] = await db
        .select()
        .from(directMessages)
        .where(or(
          and(eq(directMessages.senderId, ctx.user.id), eq(directMessages.receiverId, peerId)),
          and(eq(directMessages.senderId, peerId), eq(directMessages.receiverId, ctx.user.id))
        ))
        .orderBy(desc(directMessages.createdAt))
        .limit(1);

      const [{ unread }] = await db
        .select({ unread: sql<number>`count(*)::int` })
        .from(directMessages)
        .where(and(
          eq(directMessages.senderId, peerId),
          eq(directMessages.receiverId, ctx.user.id),
          eq(directMessages.isRead, false)
        ));

      // Check friend status
      const areFriends = await isFriend(db, ctx.user.id, peerId);

      if (user && lastMsg) {
        conversations.push({
          user,
          lastMessage: lastMsg.content.slice(0, 100),
          lastMessageAt: lastMsg.createdAt,
          unread,
          isFriend: areFriends,
        });
      }
    }

    // Sort by most recent
    conversations.sort((a, b) =>
      new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
    );

    return conversations;
  }),

  /**
   * Get urgent unread messages (for real-time alert display)
   */
  getUrgentMessages: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];

    return db
      .select({
        id: directMessages.id,
        content: directMessages.content,
        senderId: directMessages.senderId,
        senderName: users.name,
        senderEmail: users.email,
        createdAt: directMessages.createdAt,
      })
      .from(directMessages)
      .innerJoin(users, eq(users.id, directMessages.senderId))
      .where(and(
        eq(directMessages.receiverId, ctx.user.id),
        eq(directMessages.isUrgent, true),
        eq(directMessages.isRead, false)
      ))
      .orderBy(desc(directMessages.createdAt))
      .limit(5);
  }),
});
