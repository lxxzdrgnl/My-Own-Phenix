import { Suspense } from "react";
import { SettingsPage } from "./settings-page";

export default function Page() {
  return (
    <Suspense>
      <SettingsPage />
    </Suspense>
  );
}
