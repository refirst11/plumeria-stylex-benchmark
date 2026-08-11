type TailwindComponentProps = {
  isRed?: boolean;
};

const TailwindComponent = ({ isRed }: TailwindComponentProps) => {
  return (
    <>
      <div
        className={[
          "p-2 text-base text-blue-500 border-blue-500 border-solid border rounded-sm",
          isRed && "text-red-500 border-red-500",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        Hello from Tailwind!
      </div>
      <div>
        <div className="mb-2 last:mb-0 min-[800px]:mb-3">First</div>
        <div className="mb-2 last:mb-0 min-[800px]:mb-3">Second</div>
        <div className="mb-2 last:mb-0 min-[800px]:mb-3">Last</div>
      </div>
    </>
  );
};

export default TailwindComponent;
