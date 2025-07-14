const checkIcon = (
  <svg width="8" height="6" viewBox="0 0 8 6" className="fill-current">
    <path d="M2.90567 6.00024...Z" />
  </svg>
);

const crossIcon = (
  <svg width="7" height="7" viewBox="0 0 8 8" className="fill-current">
    <path d="M7.4499 0.512524...Z" />
  </svg>
);

const OfferList = ({
                     text,
                     status,
                   }: {
  text: string;
  status: "active" | "inactive";
}) => {
  return (
    <div className="mb-3 flex items-center">
      <span className="bg-primary/10 mr-3 flex h-[18px] w-full max-w-[18px] items-center justify-center rounded-full text-white">
        {status === "active" ? checkIcon : crossIcon}
      </span>
      <p className="text-body-color m-0 text-base font-medium">{text}</p>
    </div>
  );
};

export default OfferList;
