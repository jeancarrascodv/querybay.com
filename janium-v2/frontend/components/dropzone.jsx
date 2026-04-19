"use client";
import React, { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import Papa from "papaparse";

export const DropzoneComponent = ({ onFilesDropped }) => {
  const [result, setResult] = useState({ data: [] });

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => {
      // This part parses the CSV
      const file = files[0];
      Papa.parse(file, {
        complete: (parsedResult) => {
          console.log("Parsed Result: ", parsedResult);
          setResult(parsedResult);
        },
        header: true, // if your CSV has a header row
      });

      // This part calls the onFilesDropped callback if provided
      if (onFilesDropped) {
        onFilesDropped(files);
      }
    },
    accept: ".csv, text/csv",
  });

  return (
    <div
      {...getRootProps()}
      className="border-dashed border-2 h-1/2 w-1/2 flex rounded-xl justify-center  items-center hover:bg-gray-500  dark:hover:bg-green-500 active:bg-gray-200    duration-200"
      style={{ borderRadius: "25px", width: "400px", height: "400px" }} // Added 'rounded-xl'
    >
      <input {...getInputProps()} />
      {isDragActive ? (
        <p className="text-center text-gray-500">Drop the files here ...</p>
      ) : (
        <p className="text-center text-gray-500">
          Drag and drop some files here, <br />
          or click to select files
        </p>
      )}
      {/* {result.data && result.data.length > 0 && (
        <table>
          <thead>
            <tr>
              {Object.keys(result.data[0]).map((key, idx) => (
                <th key={idx}>{key}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.data.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {Object.values(row).map((value, cellIndex) => (
                  <td key={cellIndex}>{value}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )} */}
    </div>
  );
};
