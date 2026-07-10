'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Navbar from '@/components/Navbar';
import Hero from '@/components/Hero';
import MenuSection from '@/components/MenuSection';
import SpecialOffers from '@/components/SpecialOffers';
import WhyChooseUs from '@/components/WhyChooseUs';
import About from '@/components/About';
import Contact from '@/components/Contact';
import Footer from '@/components/Footer';
import LocationOnVisit from '@/components/LocationOnVisit';
import { ErrorBoundary } from '@/components/ErrorBoundary';

const Reviews = dynamic(() => import('@/components/Reviews'), {
  loading: () => <section className="section-pad bg-[#0a0a0a] min-h-[320px]" aria-hidden />,
});

const Gallery = dynamic(() => import('@/components/Gallery'), {
  loading: () => <section className="section-pad bg-[#0a0a0a] min-h-[320px]" aria-hidden />,
});

const Cart = dynamic(() => import('@/components/Cart'), { ssr: false });

export default function Home() {
  const [cartOpen, setCartOpen] = useState(false);
  const [cartTab, setCartTab] = useState<'cart' | 'wishlist'>('cart');
  const [darkMode, setDarkMode] = useState(true);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    document.documentElement.classList.toggle('light', !darkMode);
  }, [darkMode]);

  const handleCartOpen = (tab: 'cart' | 'wishlist' = 'cart') => {
    setCartTab(tab);
    setCartOpen(true);
  };

  return (
    <ErrorBoundary>
      <main id="main-content" className={darkMode ? 'dark' : 'light'}>
        <Navbar
          onCartOpen={handleCartOpen}
          darkMode={darkMode}
          onDarkModeToggle={() => setDarkMode(d => !d)}
        />

        <section id="home" aria-label="Home">
          <Hero onOrderNow={() => handleCartOpen('cart')} />
        </section>

        <section id="menu" aria-label="Menu">
          <MenuSection />
        </section>

        <section id="offers" aria-label="Special offers">
          <SpecialOffers />
        </section>

        <div className="flame-divider mx-4 sm:mx-8 md:mx-16" aria-hidden />

        <WhyChooseUs />

        <section id="reviews" aria-label="Customer reviews">
          <Reviews />
        </section>

        <Gallery />

        <section id="about" aria-label="About us">
          <About />
        </section>

        <section id="contact" aria-label="Contact">
          <Contact />
        </section>

        <Footer />

        <Cart isOpen={cartOpen} onClose={() => setCartOpen(false)} initialTab={cartTab} />

        <LocationOnVisit />
      </main>
    </ErrorBoundary>
  );
}
