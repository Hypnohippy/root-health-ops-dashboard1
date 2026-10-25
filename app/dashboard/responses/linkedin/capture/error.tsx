'use client';
import './capture.css';
export default function Error({reset}:{reset:()=>void}){return <section className="linkedin-capture"><h1>Capture LinkedIn conversation</h1><p role="alert">Your existing contacts could not be loaded. Nothing was captured or sent.</p><button onClick={reset}>Retry loading contacts</button></section>;}
