import { Loader2 } from "lucide-react";

export function LoadingSpinner() {
  return (
    <div className="flex justify-center items-center h-48 w-full">
      <Loader2 className="w-10 h-10 text-primary animate-spin" />
    </div>
  );
}
