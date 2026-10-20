import "./style.css";
if (/^\/admin(?:\/|$)/.test(location.pathname)) void import("./admin/main");
else void import("./main");
