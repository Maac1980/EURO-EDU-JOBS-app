import { Upload, FileSpreadsheet } from "lucide-react";

export default function BulkUpload() {
  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <h1 className="text-2xl font-bold text-white flex items-center gap-2 mb-6"><Upload className="w-6 h-6" /> Bulk Upload</h1>
      <div className="bg-card border border-border rounded-xl p-8">
        <div className="border-2 border-dashed border-border rounded-xl p-12 text-center">
          <FileSpreadsheet className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-40" />
          <p className="text-white font-bold mb-1">Drop CSV file here</p>
          <p className="text-sm text-muted-foreground mb-4">or click to browse — supports .csv, .xlsx</p>
          <button className="px-6 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold">Choose File</button>
        </div>
      </div>
    </div>
  );
}
