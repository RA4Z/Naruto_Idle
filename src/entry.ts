import "./style.css";
if (/^\/admin(?:\/|$)/.test(location.pathname)) void import("./admin/main");
else if (/^\/arena(?:\/|$)/.test(location.pathname))
  void import("./arena/page");
else void import("./main");
