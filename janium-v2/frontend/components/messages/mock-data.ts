export interface Message {
  id: string;
  sender: string;
  content: string;
  timestamp: string;
  type: "email" | "linkedin";
  isMe: boolean;
}

export interface Campaign {
  id: string;
  name: string;
  status: "active" | "completed" | "paused";
}

export interface LogEntry {
  id: string;
  title: string;
  date: string;
  type: "in-queue" | "connection-request" | "email" | "meeting" | "review";
  status?: "completed" | "pending";
}

export interface Note {
  id: string;
  content: string;
  date: string;
}

export interface Contact {
  id: string;
  name: string;
  role: string;
  company: string;
  location: string;
  avatar: string;
  status: "online" | "offline";
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  conversationStatus?: "talking" | "closed";
  emails: string[];
  phones: string[];
  linkedin?: string;
  messages: Message[];
  campaigns: Campaign[];
  contactLog: LogEntry[];
  notes: Note[];
}

export const mockContacts: Contact[] = [
  {
    id: "1",
    name: "Curtis Statemen",
    role: "Vice President of Sales",
    company: "Open AI",
    location: "San Francisco, California, United States",
    avatar: "https://github.com/shadcn.png",
    status: "online",
    lastMessage: "You: Hi Jason, Blah blah blah blah...",
    lastMessageTime: "9:46 AM",
    unreadCount: 1,
    conversationStatus: "talking",
    emails: ["curtis.statemen@gmail.com", "curtiss@gmail.com"],
    phones: ["205-382-4467"],
    linkedin: "https://linkedin.com/in/curtis",
    campaigns: [
      { id: "c1", name: "Campaign 01", status: "active" },
      { id: "c2", name: "Campaign 02", status: "completed" },
      { id: "c3", name: "Campaign 03", status: "paused" },
      { id: "c4", name: "Campaign 04", status: "active" },
    ],
    contactLog: [
      {
        id: "l1",
        title: "In Queue",
        date: "Today",
        type: "in-queue",
        status: "pending",
      },
      {
        id: "l2",
        title: "LinkedIn Connection Request",
        date: "Yesterday",
        type: "connection-request",
        status: "completed",
      },
      {
        id: "l3",
        title: "Email Follow-Up",
        date: "12/10/2025",
        type: "email",
        status: "completed",
      },
      {
        id: "l4",
        title: "Project Update Meeting",
        date: "11/10/2025",
        type: "meeting",
        status: "completed",
      },
      {
        id: "l5",
        title: "Client Feedback Review",
        date: "10/10/2025",
        type: "review",
        status: "completed",
      },
    ],
    notes: [
      {
        id: "n1",
        content:
          "Amet minim mollit non deserunt ullamco est sit aliqua dolor do amet sint. Velit officia consequat duis enim velit mollit. Exercitation veniam consequat...",
        date: "Feb/10/2023 10:30AM",
      },
    ],
    messages: [
      {
        id: "m1",
        sender: "Curtis Statemen",
        content:
          "This is the very beginning of your conversation with Curtis...",
        timestamp: "07:11 am",
        type: "email",
        isMe: false,
      },
      {
        id: "m2",
        sender: "Curtis Statemen",
        content:
          "This is the very beginning of your conversation with Curtis...",
        timestamp: "07:11 am",
        type: "linkedin",
        isMe: false,
      },
      {
        id: "m3",
        sender: "Curtis Statemen",
        content:
          "This is the very beginning of your conversation with Curtis...",
        timestamp: "07:11 am",
        type: "linkedin",
        isMe: false,
      },
      {
        id: "m4",
        sender: "Me",
        content:
          "Amet minim mollit non deserunt ullamco est sit aliqua dolor do amet sint. Velit officia consequat duis enim velit mollit. Exercitation veniam.",
        timestamp: "07:11 am",
        type: "linkedin",
        isMe: true,
      },
    ],
  },
  {
    id: "2",
    name: "Jason Statham",
    role: "Actor",
    company: "Hollywood",
    location: "Los Angeles, California",
    avatar: "",
    status: "offline",
    lastMessage: "I'll be back.",
    lastMessageTime: "Yesterday",
    unreadCount: 0,
    emails: ["jason@hollywood.com"],
    phones: ["555-0123"],
    campaigns: [],
    contactLog: [],
    notes: [],
    messages: [],
  },
  {
    id: "3",
    name: "Sarah Connor",
    role: "Resistance Leader",
    company: "Humanity",
    location: "Unknown",
    avatar: "",
    status: "offline",
    lastMessage: "No fate but what we make.",
    lastMessageTime: "2 days ago",
    unreadCount: 2,
    emails: ["sarah@resistance.org"],
    phones: [],
    campaigns: [],
    contactLog: [],
    notes: [],
    messages: [],
  },
];
