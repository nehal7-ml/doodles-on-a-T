// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },
  css: ["~/assets/css/main.css"],

  modules: ["@nuxt/ui", "@nuxt/eslint", "@vercel/analytics"],
  app: {
    head: {
      htmlAttrs: {
        lang: "en",
      },
      meta: [
        {
          name: "description",
          content:
            "Hand-drawn doodles printed on demand — t-shirts, hoodies and more from doodles.on.a.T.",
        },
        { property: "og:site_name", content: "doodles.on.a.T" },
      ],
      link: [{ rel: "icon", type: "image/x-icon", href: "/logo.png" }],
    },
  },
});
