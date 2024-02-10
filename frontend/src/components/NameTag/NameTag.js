// src/components/NameTag/NameTag.js

import React from 'react';
// import { Link } from 'react-router-dom';
import './NameTag.css';

const NameTag = ({ onClick }) => {
  return (
    <div className="nameTag" onClick={onClick} role="button" tabIndex={0} onKeyDown={onClick}>
      David Ledbetter
    </div>
  );
};

export default NameTag;
