import React from 'react';
import { Routes, Route } from 'react-router-dom';
import HomePage from '../page/HomePage';

const routes = (
  <Routes>
    <Route path="/" element={<HomePage />} />
    <Route path="/login" element={<HomePage initialPage="login" />} />
  </Routes>
)

export default routes;  