"use client";

import axios from "axios";
import { useState, useEffect, useRef } from "react";
import * as z from "zod";
import { Send, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormField, FormItem, FormControl } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { ChatCompletionRequestMessage } from "openai";
import { toast } from "react-hot-toast";
import { useChatStore } from "@/store/useChatStore";

import { formSchema } from "./constants";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { Empty } from "@/components/empty";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/user-avatar";
import { BotAvatar } from "@/components/bot-avatar";
import { Spinner } from "@/components/ui/spinner";

const AI = () => {
  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const {
    messages,
    addMessage,
    setMessages,
    clearMessages,
    removeLastMessage,
  } = useChatStore();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      prompt: "",
    },
  });

  // Handle Enter key to send message
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !isLoading) {
      e.preventDefault();
      form.handleSubmit(onSubmit)();
    }
  };

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      setIsLoading(true);
      const userMessage: ChatCompletionRequestMessage = {
        role: "user",
        content: values.prompt,
      };
      const newMessages = [...messages, userMessage];

      addMessage(userMessage);
      form.reset();

      const response = await axios.post("/api/conversation", {
        messages: newMessages,
      });

      if (response.data && response.data.content) {
        addMessage(response.data);
      } else {
        toast.error("Failed to get response from AI");
      }
    } catch (error: any) {
      console.error("[CONVERSATION ERROR]", error);
      const errorMessage =
        error.response?.data?.message ||
        error.message ||
        "An error occurred while processing your request";
      toast.error(errorMessage);

      // Remove the last user message if there was an error
      removeLastMessage();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden m-8 mt-5">
      <div className="flex items-center justify-between ">
        <div className="  flex items-center gap-x-3 mb-8">
          <div>
            <h2 className="text-2xl font-bold">AI Chat</h2>
            <p className="text-sm text-muted-foreground">
              Chat with OpenAI&apos;s GPT-3.5 Turbo model powered by Janium
            </p>
          </div>
        </div>
        {messages.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              clearMessages();
              toast.success("Chat history cleared");
            }}
            className="flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Clear Chat
          </Button>
        )}
      </div>
      <div className="flex-1 flex  flex-col overflow-hidden px-4 lg:px-8">
        {/* Input Form - at top when no chat history */}
        {messages.length === 0 && (
          <div className="flex-1 flex flex-col justify-between">
            <div className="flex-1 flex items-center justify-center">
              <Empty label="Start a conversation to begin chatting with Janium AI" />
            </div>
            <div className="bg-white dark:bg-gray-950 pb-4">
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(onSubmit)}
                  className="
                    rounded-lg 
                    border 
                    border-gray-200
                    dark:border-gray-800
                    w-full 
                    p-4 
                    px-3 
                    md:px-6 
                    grid
                    grid-cols-12
                    gap-2
                    bg-white
                    dark:bg-gray-900
                  "
                >
                  <FormField
                    name="prompt"
                    render={({ field }) => (
                      <FormItem className="col-span-12 lg:col-span-10">
                        <FormControl className="m-0 p-0">
                          <Input
                            className="border-0 outline-none bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                            disabled={isLoading}
                            placeholder="Hey, how are you doing today?"
                            {...field}
                            onKeyDown={handleKeyDown}
                            autoFocus
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <Button
                    className="col-span-12 lg:col-span-2 w-full  "
                    type="submit"
                    disabled={isLoading || !form.watch("prompt").trim()}
                  >
                    Talk with Janium
                  </Button>
                </form>
              </Form>
            </div>
          </div>
        )}

        {/* Show chat history only if there are messages */}
        {messages.length > 0 && (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Chat history - scrollable */}
            <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2">
              <div className="flex flex-col gap-y-4">
                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={cn(
                      "flex items-end gap-3 animate-in fade-in",
                      message.role === "user" ? "justify-end" : "justify-start"
                    )}
                  >
                    {message.role !== "user" && (
                      <div className="flex-shrink-0">
                        <BotAvatar />
                      </div>
                    )}
                    <div
                      className={cn(
                        "max-w-xs lg:max-w-md px-4 py-3 rounded-lg",
                        message.role === "user"
                          ? "bg-violet-500 text-white rounded-br-none"
                          : "bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-bl-none"
                      )}
                    >
                      <p className="text-sm whitespace-pre-wrap break-words">
                        {message.content}
                      </p>
                    </div>
                    {message.role === "user" && (
                      <div className="flex-shrink-0">
                        <UserAvatar />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {isLoading && (
                <div className="flex items-end gap-3">
                  <div className="flex-shrink-0">
                    <BotAvatar />
                  </div>
                  <div className="bg-gray-200 dark:bg-gray-700 px-4 py-3 rounded-lg rounded-bl-none">
                    <Spinner />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Form - stays at bottom when there is chat history */}
            <div className="bg-white dark:bg-gray-950 pb-4 flex-shrink-0">
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(onSubmit)}
                  className="
                  rounded-lg 
               
                  w-full 
                  p-4 
                  px-3 
                  md:px-6 
                  grid
                  grid-cols-12
                  gap-2
                  bg-white
                  dark:bg-gray-900
                  focus:outline-none
                  "
                >
                  <FormField
                    name="prompt"
                    render={({ field }) => (
                      <FormItem className="col-span-12 lg:col-span-10">
                        <FormControl className="m-0 p-0">
                          <Input
                            className="border-0 bg-transparent focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                            disabled={isLoading}
                            placeholder="Hey , how are you doing today?"
                            {...field}
                            onKeyDown={handleKeyDown}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <Button
                    className="col-span-12 lg:col-span-2 w-full hover:bg-zinc-600/90 "
                    type="submit"
                    disabled={isLoading || !form.watch("prompt").trim()}
                  >
                    <Send className="w-4 h-4 mr-2" />
                    Send
                  </Button>
                </form>
              </Form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AI;
