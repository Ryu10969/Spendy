import styles from "./FieldError.module.css";

type FieldErrorProps = {
  id: string;
  message: string;
};

export function FieldError({ id, message }: FieldErrorProps) {
  return (
    <p className={styles.error} id={id} role="alert">
      <span className={styles.icon} aria-hidden="true">
        !
      </span>
      <span>{message}</span>
    </p>
  );
}
