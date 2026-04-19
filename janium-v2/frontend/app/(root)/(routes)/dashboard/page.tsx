import { DataTableDemo } from "@/components/data-table";
import { Overview } from "@/components/overview";
import { TabContent } from "@/components/tab-content";
const RootPage = () => {
  return (
    <div>
      <div className="w-full flex justify-end items-end ">
        {/* <Overview /> */}
      </div>
      <TabContent />
      {/* <DataTableDemo /> */}
    </div>
  );
};

export default RootPage;
