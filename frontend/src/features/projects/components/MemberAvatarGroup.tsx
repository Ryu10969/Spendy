import type { ProjectMember } from "../../../types/project";
import { MemberAvatar } from "./MemberAvatar";
import styles from "./MemberAvatarGroup.module.css";

type MemberAvatarGroupProps = {
  members: ProjectMember[];
};

export function MemberAvatarGroup({ members }: MemberAvatarGroupProps) {
  return (
    <div className={styles.group} aria-label={`${members.length}人のメンバー`}>
      <div className={styles.avatars} aria-hidden="true">
        {members.slice(0, 4).map((member, index) => (
          <MemberAvatar
            key={member.id}
            label={member.avatarLabel}
            name={member.displayName}
            index={index}
          />
        ))}
      </div>
      <span className={styles.count}>{members.length}人</span>
    </div>
  );
}
