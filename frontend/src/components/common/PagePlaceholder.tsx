import styles from "./PagePlaceholder.module.css";

type PagePlaceholderProps = {
  title: string;
  description: string;
};

export function PagePlaceholder({ title, description }: PagePlaceholderProps) {
  return (
    <section className={styles.placeholder} aria-labelledby="page-title">
      <p className={styles.label}>Implementation placeholder</p>
      <h1 id="page-title" className={styles.title}>
        {title}
      </h1>
      <p className={styles.description}>{description}</p>
    </section>
  );
}
