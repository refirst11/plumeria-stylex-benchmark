import stylex from "@stylexjs/stylex";

const styles = stylex.create({
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

const styles2 = stylex.create({
  container: {
    marginBottom: {
      default: "0.5rem",
      ":last-child": 0,
      "@media screen and (min-width: 800px)": "0.75rem",
    },
  },
});

type StylexComponentProps = {
  isRed?: boolean;
};

const StylexComponent = ({ isRed }: StylexComponentProps) => {
  return (
    <>
      <div {...stylex.props(styles.base, isRed && styles.red)}>
        Hello from StyleX!
      </div>
      <div>
        <div {...stylex.props(styles2.container)}>First</div>
        <div {...stylex.props(styles2.container)}>Second</div>
        <div {...stylex.props(styles2.container)}>Last</div>
      </div>
    </>
  );
};

export default StylexComponent;
