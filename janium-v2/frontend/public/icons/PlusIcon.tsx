import React from "react";

interface PlusIconProps {
  className?: string;
  width?: number;
  height?: number;
  fill?: string;
}

const PlusIcon: React.FC<PlusIconProps> = ({
  className = "",
  width = 10,
  height = 10,
  fill = "white",
}) => {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 10 10"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M4.72414 10V0H5.27586V10H4.72414ZM0 5.27586V4.72414H10V5.27586H5H0Z"
        fill={fill}
      />
    </svg>
  );
};

export default PlusIcon;
