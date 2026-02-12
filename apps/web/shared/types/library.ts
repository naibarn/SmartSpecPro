/**
 * Shared types for library service with group permissions support
 */

export interface PermissionSource {
  type: 'owner' | 'direct' | 'group' | 'tenant_role';
  permissionLevel?: 'read' | 'write' | 'delete' | 'owner';
  subjectId?: string;
  groupName?: string;  // Only present for type = 'group'
}

export interface EffectivePermission {
  effectivePermissionLevel: 'read' | 'write' | 'delete' | 'owner' | null;
  sources: PermissionSource[];
}
