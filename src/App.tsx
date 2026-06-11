import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { AUTH_BYPASS_ACTIVE } from "@/lib/devAuthBypass";
import { DevModeAuthBypassBanner } from "@/components/DevModeAuthBypassBanner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { lazy, Suspense } from "react";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";

const DesignSystem = lazy(() => import("./pages/DesignSystem.tsx"));


const queryClient = new QueryClient();

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <DevModeAuthBypassBanner />
            <div className={AUTH_BYPASS_ACTIVE ? "pt-8" : ""}>
              <Routes>
                <Route path="/design-system" element={<Suspense fallback={null}><DesignSystem /></Suspense>} />
                <Route path="/404" element={<NotFound />} />
                <Route path="*" element={<Index />} />
              </Routes>
            </div>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
