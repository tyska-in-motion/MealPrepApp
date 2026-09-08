import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import Recipes from "@/pages/Recipes";
import Ingredients from "@/pages/Ingredients";
import MealPlan from "@/pages/MealPlan";
import SharedMeals from "@/pages/SharedMeals";
import ShoppingList from "@/pages/ShoppingList";
import Summary from "@/pages/Summary";
import MealPlanTemplates from "@/pages/MealPlanTemplates";
import MealPrep from "@/pages/MealPrep";
import BodyMeasurements from "@/pages/BodyMeasurements";
import { ThemeProvider } from "@/components/theme-provider";


const MealPlanPage = () => <MealPlan />;
const SharedMealsPage = () => <SharedMeals />;

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/recipes" component={Recipes} />
      <Route path="/ingredients" component={Ingredients} />
      <Route path="/meal-plan" component={MealPlanPage} />
      <Route path="/shared-meals" component={SharedMealsPage} />
      <Route path="/shopping-list" component={ShoppingList} />
      <Route path="/meal-plan-templates" component={MealPlanTemplates} />
      <Route path="/meal-prep" component={MealPrep} />
      <Route path="/summary" component={Summary} />
      <Route path="/body-measurements" component={BodyMeasurements} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Router />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
