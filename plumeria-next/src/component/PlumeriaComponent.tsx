import * as css from "@plumeria/core";

const styles = css.create({
  base: {
    padding: "8px",
    fontSize: "16px",
    color: "blue",
    borderColor: "blue",
    borderStyle: "solid",
    borderWidth: "1px",
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
      <div classStyle={[styles.base, isRed && styles.red]}>
        Hello from Plumeria!
      </div>
      <div>
        <div classStyle={styles2.container}>First</div>
        <div classStyle={styles2.container}>Second</div>
        <div classStyle={styles2.container}>Last</div>
      </div>
    </>
  );
};

export default PlumeriaComponent;
