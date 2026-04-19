import React from "react";

interface InfoIconProps {
  className?: string;
  width?: number | string;
  height?: number | string;
  fill?: string;
}

const InfoIcon: React.FC<InfoIconProps> = ({
  className,
  width = 7,
  height = 6,
  fill = "#F8FAFC",
}) => {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 7 6"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect
        x="0.410722"
        y="0.210526"
        width="5.57895"
        height="5.57895"
        rx="2.78947"
        stroke={fill}
        strokeWidth="0.421053"
      />
      <path
        d="M3.0324 4.5V2.31818H3.36763V4.5H3.0324ZM3.20286 1.95455C3.13752 1.95455 3.08117 1.93229 3.03382 1.88778C2.98742 1.84328 2.96422 1.78977 2.96422 1.72727C2.96422 1.66477 2.98742 1.61127 3.03382 1.56676C3.08117 1.52225 3.13752 1.5 3.20286 1.5C3.2682 1.5 3.32407 1.52225 3.37047 1.56676C3.41782 1.61127 3.4415 1.66477 3.4415 1.72727C3.4415 1.78977 3.41782 1.84328 3.37047 1.88778C3.32407 1.93229 3.2682 1.95455 3.20286 1.95455Z"
        fill={fill}
      />
    </svg>
  );
};

export default InfoIcon;
