@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=DM+Sans:wght@400;500;700&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --font-display: 'Outfit', sans-serif;
  --font-body: 'DM Sans', sans-serif;

  /* Emerald Green Theme - Fresh & Healthy */
  --background: 150 30% 98%;
  --foreground: 160 50% 10%;
  
  --primary: 150 60% 35%;
  --primary-foreground: 0 0% 100%;
  
  --secondary: 150 40% 92%;
  --secondary-foreground: 160 50% 20%;
  
  --muted: 150 20% 94%;
  --muted-foreground: 160 20% 45%;
  
  --accent: 85 60% 45%;
  --accent-foreground: 0 0% 100%;
  
  --destructive: 0 84% 60%;
  --destructive-foreground: 0 0% 98%;

  --border: 150 20% 88%;
  --input: 150 20% 88%;
  --ring: 150 60% 35%;
  
  --card: 0 0% 100%;
  --card-foreground: 160 50% 10%;

  --radius: 1rem;
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground font-body antialiased;
    font-feature-settings: "rlig" 1, "calt" 1;
    -webkit-tap-highlight-color: transparent;
    text-size-adjust: 100%;
  }
  h1, h2, h3, h4, h5, h6 {
    @apply font-display font-bold tracking-tight;
  }
}

/* Custom Scrollbar */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  @apply bg-muted-foreground/20 rounded-full;
}
::-webkit-scrollbar-thumb:hover {
  @apply bg-muted-foreground/40;
}

/* Smooth transitions */
.page-transition {
  animation: fadeIn 0.4s ease-out forwards;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.glass-card {
  @apply bg-white/80 backdrop-blur-md border border-white/20 shadow-xl;
}

@media (max-width: 768px) {
  html, body {
    overscroll-behavior-y: none;
  }
}
