import { useLocation } from "wouter";
import { FeedbackButton } from "./FeedbackButton";

export function RouteAwareFeedbackButton() {
  const [location] = useLocation();
  const pathname = location.split(/[?#]/, 1)[0].replace(/\/+$/, "") || "/";

  // Keep the global assistant/dialog subtree off the login surface. It has
  // unrelated portal and auth lifecycles that can interfere with sign-in.
  if (pathname.toLowerCase() === "/login") {
    return null;
  }

  return <FeedbackButton />;
}
