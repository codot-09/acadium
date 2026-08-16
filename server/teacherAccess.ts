export function canSelectTeacherRole(currentRole: "teacher" | "student") {
  return currentRole === "teacher";
}

export function canRedeemTeacherInvite(input: { exists: boolean; usedAt: Date | null; expiresAt: Date }, now = new Date()) {
  return input.exists && !input.usedAt && input.expiresAt.getTime() >= now.getTime();
}
