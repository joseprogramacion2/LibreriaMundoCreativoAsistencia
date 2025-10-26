import React from "react";
import { Link } from "react-router-dom";
import { FaHandsHelping, FaBullseye, FaEye, FaBook, FaClipboardCheck } from "react-icons/fa";

const INFO = {
  titulo: "Librería Mundo Creativo",
  lema: "Donde cada idea cobra vida 📚✨",
  quienes:
    "Somos una empresa guatemalteca dedicada a ofrecer útiles escolares, artículos de papelería, oficina y arte. Nuestro compromiso es brindar productos de calidad que acompañen a estudiantes, docentes y empresas en su día a día con responsabilidad y cercanía.",
  mision:
    "Proveer materiales y servicios que faciliten la enseñanza, el aprendizaje y el trabajo, garantizando atención personalizada, precios justos y confianza a lo largo del tiempo.",
  vision:
    "Ser la librería y papelería más confiable de la región, reconocida por su innovación, variedad y compromiso con el desarrollo educativo y cultural de la comunidad.",
  valores: [
    "Compromiso y responsabilidad",
    "Atención cercana y humana",
    "Honestidad y confianza",
    "Innovación constante",
  ],
  servicios: [
    "Útiles escolares y de oficina",
    "Papelería, mochilas y accesorios",
    "Arte y manualidades",
    "Servicios de copiado, impresión y anillado",
  ],
};

export default function Inicio() {
  return (
    <div className="inicio-page">
      {/* HERO */}
      <section className="hero">
        <div className="hero-left">
          <h1 className="hero-title">{INFO.titulo}</h1>
          <p className="hero-sub">“{INFO.lema}”</p>
          <div className="hero-buttons">
            <Link to="/panel" className="btn green">Ir al Dashboard</Link>
            <Link to="/asistencia/diaria" className="btn blue">Ver asistencia de hoy</Link>
          </div>
        </div>
        <div className="hero-right">
          <img src="/img/libreria.jpg" alt="Librería Mundo Creativo" />
        </div>
      </section>

      {/* QUIÉNES SOMOS */}
      <section className="card about">
        <h2><FaHandsHelping /> Quiénes somos</h2>
        <p>{INFO.quienes}</p>
      </section>

      {/* MISIÓN / VISIÓN */}
      <section className="grid">
        <div className="card">
          <h2><FaBullseye /> Misión</h2>
          <p>{INFO.mision}</p>
        </div>
        <div className="card">
          <h2><FaEye /> Visión</h2>
          <p>{INFO.vision}</p>
        </div>
      </section>

      {/* VALORES Y SERVICIOS */}
      <section className="grid">
        <div className="card">
          <h2><FaClipboardCheck /> Nuestros valores</h2>
          <ul>
            {INFO.valores.map((v, i) => (
              <li key={i}>{v}</li>
            ))}
          </ul>
        </div>
        <div className="card">
          <h2><FaBook /> Lo que ofrecemos</h2>
          <ul>
            {INFO.servicios.map((v, i) => (
              <li key={i}>{v}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* PIE DE PÁGINA */}
      <footer className="footer">
        <p>© {new Date().getFullYear()} Librería Mundo Creativo — Panel Administrativo</p>
        <p className="foot-sub">Desarrollado para el sistema de control de asistencia</p>
      </footer>

      <style>{`
        .inicio-page {
          display: flex;
          flex-direction: column;
          gap: 18px;
          animation: fadeIn 0.4s ease;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .hero {
          display: grid;
          grid-template-columns: 1.1fr 0.9fr;
          gap: 20px;
          align-items: center;
          background: linear-gradient(120deg, #f0fdf4, #f9fafb);
          border-radius: 16px;
          box-shadow: 0 6px 18px rgba(2,6,23,.06);
          padding: 30px 24px;
        }
        @media (max-width: 960px) {
          .hero { grid-template-columns: 1fr; text-align: center; }
        }

        .hero-title {
          font-size: 34px;
          font-weight: 900;
          color: #0f172a;
          margin-bottom: 6px;
        }
        .hero-sub {
          font-size: 18px;
          color: #475569;
          font-weight: 600;
          margin-bottom: 16px;
        }
        .hero-buttons {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .btn {
          display: inline-block;
          padding: 10px 16px;
          border-radius: 999px;
          font-weight: 800;
          text-decoration: none;
          color: #fff;
          transition: all .2s ease;
          box-shadow: 0 8px 18px rgba(2,6,23,.08);
        }
        .btn.green {
          background: linear-gradient(135deg, #10b981, #059669);
        }
        .btn.blue {
          background: linear-gradient(135deg, #3b82f6, #0284c7);
        }
        .btn:hover { transform: translateY(-1px); box-shadow: 0 12px 20px rgba(2,6,23,.15); }

        .hero-right img {
          width: 100%;
          height: 270px;
          object-fit: cover;
          border-radius: 14px;
          border: 1px solid #e5e7eb;
          box-shadow: 0 10px 26px rgba(2,6,23,.08);
        }

        .card {
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          padding: 20px;
          box-shadow: 0 6px 16px rgba(2,6,23,.04);
        }

        .card h2 {
          font-size: 18px;
          font-weight: 900;
          color: #0f172a;
          margin-bottom: 8px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .card p {
          color: #334155;
          font-weight: 600;
          line-height: 1.65;
          margin: 0;
        }

        .card ul {
          margin: 8px 0 0 18px;
          color: #334155;
          font-weight: 600;
          line-height: 1.6;
        }

        .grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        @media (max-width: 960px) { .grid { grid-template-columns: 1fr; } }

        .footer {
          text-align: center;
          padding: 16px;
          color: #64748b;
          font-size: 14px;
          margin-top: 10px;
          border-top: 1px solid #e5e7eb;
        }
        .foot-sub {
          font-size: 13px;
          color: #94a3b8;
          margin-top: 4px;
        }
      `}</style>
    </div>
  );
}
