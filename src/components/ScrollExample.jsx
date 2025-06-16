import React, { useEffect, useRef } from 'react';
import './ScrollExample.css';

const ScrollExample = () => {
  const progressRef = useRef(null);
  const headerRef = useRef(null);

  useEffect(() => {
    // Scroll Progress Bar
    const updateProgress = () => {
      const winScroll = document.documentElement.scrollTop;
      const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      const scrolled = (winScroll / height) * 100;
      progressRef.current.style.transform = `scaleX(${scrolled / 100})`;
    };

    // Sticky Header
    const handleScroll = () => {
      if (window.scrollY > 50) {
        headerRef.current.classList.add('scrolled');
      } else {
        headerRef.current.classList.remove('scrolled');
      }
    };

    // Intersection Observer for fade-in animations
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
          }
        });
      },
      { threshold: 0.1 }
    );

    // Observe all fade-in elements
    document.querySelectorAll('.fade-in').forEach((el) => observer.observe(el));

    window.addEventListener('scroll', updateProgress);
    window.addEventListener('scroll', handleScroll);

    return () => {
      window.removeEventListener('scroll', updateProgress);
      window.removeEventListener('scroll', handleScroll);
      observer.disconnect();
    };
  }, []);

  return (
    <div>
      {/* Progress Bar */}
      <div ref={progressRef} className="scroll-progress" />

      {/* Sticky Header */}
      <header ref={headerRef} className="sticky-header">
        <h1>Scroll Examples</h1>
      </header>

      {/* Scroll Snap Container */}
      <div className="scroll-container custom-scrollbar">
        <div className="scroll-item fade-in">
          <h2>Section 1</h2>
          <p>This section uses scroll snap and fade-in animation.</p>
        </div>
        <div className="scroll-item fade-in">
          <h2>Section 2</h2>
          <p>Scroll to see the next section snap into place.</p>
        </div>
        <div className="scroll-item fade-in">
          <h2>Section 3</h2>
          <p>Notice the smooth scrolling behavior.</p>
        </div>
      </div>

      {/* Parallax Section */}
      <div 
        className="parallax fade-in"
        style={{
          height: '400px',
          backgroundImage: 'url("https://source.unsplash.com/random/1920x1080")'
        }}
      >
        <h2>Parallax Background</h2>
      </div>

      {/* Regular Content with Fade-in */}
      <div className="content">
        <div className="fade-in">
          <h2>Fade-in Section</h2>
          <p>This content fades in as you scroll to it.</p>
        </div>
        <div className="fade-in">
          <h2>Another Fade-in Section</h2>
          <p>More content that appears with a smooth animation.</p>
        </div>
      </div>
    </div>
  );
};

export default ScrollExample; 