import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import TheShift from "@/components/TheShift";
import HowItWorks from "@/components/HowItWorks";
import Impact from "@/components/Impact";
import Dashboard from "@/components/Dashboard";
import Privacy from "@/components/Privacy";
import Fable from "@/components/Fable";
import NeverGuilt from "@/components/NeverGuilt";
import Faq from "@/components/Faq";
import Cta from "@/components/Cta";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <TheShift />
        <HowItWorks />
        <Impact />
        <Dashboard />
        <Privacy />
        <Fable />
        <NeverGuilt />
        <Faq />
        <Cta />
      </main>
      <Footer />
    </>
  );
}
