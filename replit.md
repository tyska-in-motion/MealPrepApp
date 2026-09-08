# NutriPlan - Meal Planning Application

## Overview

NutriPlan is a full-stack meal planning and nutrition tracking application. Users can manage ingredients with nutritional data, create recipes from those ingredients, plan meals across days, track calorie/macro consumption, and generate shopping lists based on planned meals.

The application follows a monorepo structure with a React frontend, Express backend, and PostgreSQL database using Drizzle ORM.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state
- **UI Components**: Shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom CSS variables for theming (emerald green theme)
- **Forms**: React Hook Form with Zod validation
- **Charts**: Recharts for nutrition visualization (pie charts for macro tracking)

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript compiled with tsx
- **API Design**: RESTful endpoints defined in `shared/routes.ts` with Zod schemas for type-safe request/response validation
- **Database ORM**: Drizzle ORM with PostgreSQL dialect
- **Build System**: Vite for frontend, esbuild for server bundling

### Data Model
The database schema (`shared/schema.ts`) includes:
- **Ingredients**: Base food items with nutritional info (calories, protein, carbs, fat per 100g/ml)
- **Recipes**: Collections of ingredients with amounts, instructions, and prep time
- **Recipe Ingredients**: Junction table linking recipes to ingredients with quantities
- **Meal Entries**: Daily meal plan entries linking recipes to dates and meal types (breakfast, lunch, dinner, snack)

### API Structure
All API routes are defined in `shared/routes.ts` with full type definitions:
- `/api/ingredients` - CRUD for ingredients
- `/api/recipes` - CRUD for recipes with ingredient associations
- `/api/meal-plan/:date` - Daily meal entries
- `/api/shopping-list` - Aggregated ingredients for date range

### Development vs Production
- Development: Vite dev server with HMR, proxied through Express
- Production: Static file serving from built assets in `dist/public`

## External Dependencies

### Database
- **PostgreSQL**: Primary database, connection via `DATABASE_URL` environment variable
- **Drizzle ORM**: Database toolkit with schema migrations via `drizzle-kit push`
- **connect-pg-simple**: PostgreSQL session store (available but not currently used for auth)

### Key NPM Packages
- **@tanstack/react-query**: Server state management and caching
- **drizzle-orm / drizzle-zod**: Type-safe database operations with Zod schema generation
- **date-fns**: Date manipulation for meal planning calendar
- **recharts**: Charting library for nutrition visualization
- **lucide-react**: Icon library
- **zod**: Runtime type validation for API contracts

### Replit-specific
- **@replit/vite-plugin-runtime-error-modal**: Error overlay in development
- **@replit/vite-plugin-cartographer**: Development tooling
- **@replit/vite-plugin-dev-banner**: Development environment indicator

## Replit Environment Setup

- **Workflow**: "Start application" runs `npm run dev` on port 5000 (webview)
- **Database**: PostgreSQL via Replit's built-in database, `DATABASE_URL` env var is set
- **Schema**: Applied with `npm run db:push` (drizzle-kit)
- **Deployment**: Configured for autoscale — build: `npm run build`, run: `node dist/index.cjs`
- **Vite config**: `allowedHosts: true` already set for Replit proxy compatibility
- **Server host**: `0.0.0.0` on port 5000 in both dev and prod