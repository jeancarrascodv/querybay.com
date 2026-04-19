"use client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
const testimonials = [
  {
    name: "Robert Brown",
    // avatar: "A",
    title: "CEO",
    desc: "This is the best service I have ever used",
  },
  {
    name: "Jane Smith",
    // avatar: "B",
    title: "Marketing Manager",
    desc: "My LinkedIn presence has improved dramatically thanks to this service.",
  },

  {
    name: "Emily White",
    // avatar: "D",
    title: "Product Manager",
    desc: "It's a game changer. I've connected with so many professionals.",
  },
  {
    name: "Michael Green",
    // avatar: "E",
    title: "HR Specialist",
    desc: "Every professional should try this service at least once. Highly recommend!",
  },
];

export const LandingContent = () => {
  return (
    <div className="px-10 pb-20">
      <h2 className="text-center text-4xl text-white font-extrabold mb-10">
        Testimonials
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {testimonials.map((item) => (
          <Card key={item.desc} className="bg-[#192339] border-none text-white">
            <CardHeader>
              <CardTitle className="flex flex-col  items-start gap-x-2">
                <div>
                  <p className="text-lg">{item.name}</p>
                </div>
                <div className="text-zinc-400 text-sm">
                  <p>{item.title}</p>
                </div>
              </CardTitle>
              <CardContent className="pt-4 px-0">{item.desc}</CardContent>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
};
