const PricingBox = (props: {
  price: string;
  duration: string;
  packageName: string;
  subtitle: string;
  children: React.ReactNode;
}) => {
  const { price, duration, packageName, subtitle, children } = props;

  return (
    <div className="w-full">
      <div className="shadow-three hover:shadow-one dark:bg-gray-dark dark:shadow-two dark:hover:shadow-gray-dark relative z-10 rounded-xs bg-white px-8 py-10">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-dark text-xl font-bold dark:text-white">
            {packageName}
          </h4>
          <h3 className="price text-[32px] font-bold text-black dark:text-white">
            ${price}
            <span className="time text-body-color text-lg font-medium">
              /{duration}
            </span>
          </h3>
        </div>
        <p className="text-body-color mb-6 text-base">{subtitle}</p>

        <div className="border-body-color/10 mb-6 border-b pb-6 dark:border-white/10">
          <button className="bg-primary/80 hover:shadow-signUp flex w-full items-center justify-center rounded-xs p-3 text-base font-semibold text-white transition duration-300 ease-in-out">
            Book a Free Consultation
          </button>
        </div>

        <div>{children}</div>

        <div className="absolute right-0 bottom-0 z-[-1]">
          {/* SVG pattern */}
        </div>
      </div>
    </div>
  );
};

export default PricingBox;
