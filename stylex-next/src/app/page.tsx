import Image from "next/image";
import styles from "./page.module.css";
import StyleXComponent from "../component/StyleXComponent";
import Test from "../component/Test";

const benchmarkItems = Array.from({ length: 1000 }).map((_, i) => ({
  color: (["red", "blue", "green", "yellow", "purple"] as const)[i % 5],
  size: (["small", "medium", "large", "xlarge"] as const)[i % 4],
  padding: (["none", "small", "medium", "large", "xlarge"] as const)[i % 5],
  borderRadius: (["none", "small", "medium", "large", "full"] as const)[i % 5],
  background: (
    ["transparent", "white", "gray", "lightBlue", "lightGreen"] as const
  )[i % 5],
}));

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1>StyleX Benchmark</h1>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "2px" }}>
          {benchmarkItems.map((item, i) => (
            <Test key={i} {...item} />
          ))}
        </div>
        <StyleXComponent isRed={true} />
        <StyleXComponent isRed={false} />
      </main>
    </div>
  );
}
