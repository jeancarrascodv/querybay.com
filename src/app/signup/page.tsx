import SignupForm from "@/components/Signup/SignupForm";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create account | QueryBay",
  description: "Create your QueryBay account to access the customer portal.",
};

const SignupPage = () => <SignupForm />;

export default SignupPage;
