import styles from "./BaselineComponent.module.css";

type BaselineComponentProps = {
  isRed?: boolean;
};

const BaselineComponent = ({ isRed }: BaselineComponentProps) => {
  return (
    <>
      <div className={[styles.base, isRed && styles.red].filter(Boolean).join(" ")}>
        Hello from Baseline!
      </div>
      <div>
        <div className={styles.container}>First</div>
        <div className={styles.container}>Second</div>
        <div className={styles.container}>Last</div>
      </div>
    </>
  );
};

export default BaselineComponent;
