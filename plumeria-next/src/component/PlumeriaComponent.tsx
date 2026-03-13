import * as css from "@plumeria/core";

const styles = css.create({
  base: {
    padding: "8px",
    fontSize: "16px",
    color: "blue",
    border: "1px solid blue",
    borderRadius: "4px",
  },
  red: {
    color: "red",
    borderColor: "red",
  },
});
const styles2 = css.create({
  container: {
    marginBottom: "0.5rem",
    ":last-child": {
      marginBottom: 0,
    },
    "@media screen and (min-width: 800px)": {
      marginBottom: "0.75rem",
    },
  },
});

type PlumeriaComponentProps = {
  isRed?: boolean;
};

const PlumeriaComponent = ({ isRed }: PlumeriaComponentProps) => {
  return (
    <>
      <div className={css.use(styles.base, isRed && styles.red)}>
        Hello from Plumeria!
      </div>
      <div>
        <div className={css.use(styles2.container)}>First</div>
        <div className={css.use(styles2.container)}>Second</div>
        <div className={css.use(styles2.container)}>Last</div>
      </div>
    </>
  );
};

export default PlumeriaComponent;
