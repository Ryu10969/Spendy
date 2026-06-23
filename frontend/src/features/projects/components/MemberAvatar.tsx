import styles from "./MemberAvatar.module.css";

type MemberAvatarProps = {
  label: string;
  name: string;
  index: number;
};

export function MemberAvatar({ label, name, index }: MemberAvatarProps) {
  return (
    <span
      className={`${styles.avatar} ${styles[`tone${(index % 4) + 1}`]}`}
      title={name}
      aria-label={name}
    >
      {label}
    </span>
  );
}
