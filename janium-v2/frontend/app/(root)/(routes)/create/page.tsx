"use client";
import React, { useCallback } from "react";
import { DropzoneComponent } from "@/components/dropzone"; // Adjust the path accordingly

const Create: React.FC = () => {
  const onDrop = useCallback((acceptedFiles: File[]) => {
    console.log(acceptedFiles);
  }, []);

  return (
    <div className=" h-full flex-1 flex-col space-y-8 p-8   pt-6 md:flex">
      <div className="flex flex-col h-screen ">
        <div className="flex items-center justify-between space-y-2">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Upload CSV</h2>
            <p className="text-muted-foreground mt-3">
              CSV Analyzer will swiftly parse your uploaded CSV, presenting the
              data in a user-friendly format
            </p>
          </div>
          <div className="flex items-center space-x-2">{/* <UserNav /> */}</div>
        </div>
        <div className="flex w-full justify-center items-center  h-full">
          <DropzoneComponent onFilesDropped={onDrop} />
        </div>
      </div>
    </div>
  );
};

export default Create;
