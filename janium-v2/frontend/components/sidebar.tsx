"use client";
import { usePathname, useRouter } from "next/navigation";
import {
  Settings,
  UserCircle,
  Rocket,
  ClipboardCheck,
  BrainCircuit,
  Import,
  Route,
  Users,
  Play,
} from "lucide-react";

import Image from "next/image";

import { cn } from "@/lib/utils";
import { ChatBubbleIcon } from "@radix-ui/react-icons";

export const Sidebar = () => {
  const pathname = usePathname();
  const router = useRouter();
  const showDevExtras = process.env.NEXT_PUBLIC_NODE_ENV === "development"; 
  const baseRoutes = [
    // {
    //   icon: Home,
    //   href: "/dashboard",
    //   label: "Home",
    //   pro: false,
    // },
    // {
    //   icon: Rocket,
    //   href: "/campaigns",
    //   label: "Campaigns",
    //   pro: false,
    // },
    // {
    //   icon: Import,
    //   href: "/import",
    //   label: "import",
    //   pro: true,
    // },
        {
      icon: Users,
      href: "/teams",
      label: "Teams",
      pro: false,
    },
    {
      icon: Route,
      href: "/integrations",
      label: "Integrations",
      pro: false,
    },
        {
      icon: UserCircle,
      href: "/contacts",
      label: "Contacts",
      pro: true,
    },
    {
      icon: Rocket,
      href: "/campaigns",
      label: "Campaigns",
      pro: false,
    },

    {
      icon: Play,
      href: "/actions",
      label: "Actions",
      pro: false,
    },
    // {
    //   icon: UserCircle,
    //   href: "/contacts",
    //   label: "Contacts",
    //   pro: false,
    // },
    // {
    //   icon: ClipboardCheck,
    //   href: "/tasks",
    //   label: "Tasks",
    //   pro: false,
    // },

    // {
    //   icon: BrainCircuit,
    //   href: "/ai",
    //   label: "AI",
    //   pro: true,
    // },
  ];

  const devRoutes = [
    // {
    //   icon: Home,
    //   href: "/dashboard",
    //   label: "Home",
    //   pro: false,
    // },

    {
      icon: ChatBubbleIcon,
      href: "/messages",
      label: "Messages",
      pro: false,
    },
    {
      icon: BrainCircuit,
      href: "/ai",
      label: "AI",
      pro: true,
    },
    {
      icon: ClipboardCheck,
      href: "/tasks",
      label: "Tasks",
      pro: false,
    },
 

  ];

  const routes = showDevExtras ? [...baseRoutes, ...devRoutes] : baseRoutes;

  const settingsRoute = {
    icon: Settings,
    href: "/settings",
    label: "Settings",
    pro: false,
  };

  const onNavigate = (url: string, pro: boolean) => {
    // ToDO = Check if Pro
    return router.push(url);
  };

  const isRouteActive = (href: string) => {
    if (href === "/dashboard") {
      return pathname === href;
    }
    // For other routes, check if pathname starts with the href
    return pathname.startsWith(href);
  };

  return (
    <div className="space-y-4 flex flex-col h-full text-primary bg-secondary ">
      <div className="p-3 flex flex-1 flex-col justify-between ">
        <div className="space-y-2">
          {routes.map((route) => (
            <div
              onClick={() => onNavigate(route.href, route.pro)}
              key={route.href}
              className={cn(
                "text-muted-foreground text-xs group flex p-3 w-full justify-start font-medium cursor-pointer hover:text-primary hover:bg-primary/10 rounded-lg transition",
                isRouteActive(route.href) && "bg-primary/10 text-primary"
              )}
            >
              <div className="flex flex-col gap-y-2 items-center flex-1">
                {typeof route.icon === "string" ? (
                  <Image
                    src={route.icon}
                    alt={route.label}
                    width={20}
                    height={20}
                    className="h-5 w-5"
                  />
                ) : (
                  <route.icon className="h-5 w-5" />
                )}
                {route.label}
              </div>
            </div>
          ))}
        </div>

        {/* Separate section for Settings (only visible in dev when enabled) */}
        {showDevExtras && (
          <div className="space-y-2 mt-4">
            <div
              onClick={() => onNavigate(settingsRoute.href, settingsRoute.pro)}
              key={settingsRoute.href}
              className={cn(
                "text-muted-foreground text-xs group flex p-3 w-full justify-start font-medium cursor-pointer hover:text-primary hover:bg-primary/10 rounded-lg transition",
                isRouteActive(settingsRoute.href) &&
                  "bg-primary/10 text-primary"
              )}
            >
              <div className="flex flex-col gap-y-2 items-center flex-1">
                {typeof settingsRoute.icon === "string" ? (
                  <Image
                    src={settingsRoute.icon}
                    alt="Icon"
                    width={20}
                    height={20}
                    className="h-5 w-5"
                  />
                ) : (
                  <settingsRoute.icon className="h-5 w-5" />
                )}
                {settingsRoute.label}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
