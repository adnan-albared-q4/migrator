import React, { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import './MegaMenu.css';

const MegaMenu = ({ items }) => {
  const [activeMenu, setActiveMenu] = useState(null);
  const [isHovering, setIsHovering] = useState(false);
  const menuRef = useRef(null);
  const timeoutRef = useRef(null);

  const handleMouseEnter = (index) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsHovering(true);
    setActiveMenu(index);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      if (isHovering) {
        setActiveMenu(null);
        setIsHovering(false);
      }
    }, 100);
  };

  const handleClick = (index) => {
    setActiveMenu(activeMenu === index ? null : index);
    setIsHovering(false);
  };

  const handleKeyDown = (event, index) => {
    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault();
        handleClick(index);
        break;
      case 'Escape':
        setActiveMenu(null);
        setIsHovering(false);
        break;
      case 'ArrowRight':
        event.preventDefault();
        setActiveMenu(Math.min((activeMenu || 0) + 1, items.length - 1));
        break;
      case 'ArrowLeft':
        event.preventDefault();
        setActiveMenu(Math.max((activeMenu || 0) - 1, 0));
        break;
      default:
        break;
    }
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setActiveMenu(null);
        setIsHovering(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <nav 
      className="mega-menu" 
      ref={menuRef}
      role="navigation"
      aria-label="Main navigation"
    >
      <ul className="mega-menu-list" role="menubar">
        {items.map((item, index) => (
          <li
            key={index}
            className="mega-menu-item"
            role="none"
            onMouseEnter={() => handleMouseEnter(index)}
            onMouseLeave={handleMouseLeave}
          >
            <button
              className="mega-menu-trigger"
              role="menuitem"
              aria-haspopup="true"
              aria-expanded={activeMenu === index}
              onClick={() => handleClick(index)}
              onKeyDown={(e) => handleKeyDown(e, index)}
            >
              {item.label}
            </button>
            {activeMenu === index && (
              <div
                className="mega-menu-dropdown"
                role="menu"
                aria-label={`${item.label} submenu`}
                onMouseEnter={() => handleMouseEnter(index)}
                onMouseLeave={handleMouseLeave}
              >
                {item.content}
              </div>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
};

MegaMenu.propTypes = {
  items: PropTypes.arrayOf(
    PropTypes.shape({
      label: PropTypes.string.isRequired,
      content: PropTypes.node.isRequired,
    })
  ).isRequired,
};

export default MegaMenu; 