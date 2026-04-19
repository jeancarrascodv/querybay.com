import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export const formatStepLabel = (stepType: string) => {
  return stepType
    ?.split("_")
    ?.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    ?.join(" ");
};
export function cleanTypename(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(cleanTypename);
  } else if (typeof obj === "object" && obj !== null) {
    const newObj: { [key: string]: any } = {};
    for (const key in obj) {
      if (key !== "__typename") {
        newObj[key] = cleanTypename(obj[key]);
      }
    }
    return newObj;
  }
  return obj;
}
