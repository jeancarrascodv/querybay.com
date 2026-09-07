import { Check, Minus } from "lucide-react";

const OfferList = ({
  text,
  status,
}: {
  text: string;
  status: "active" | "inactive";
}) => (
  <li
    className={`qb-offer ${status === "inactive" ? "qb-offer-inactive" : ""}`}
  >
    {status === "active" ? <Check size={16} /> : <Minus size={16} />}
    <span>{text}</span>
  </li>
);

export default OfferList;
