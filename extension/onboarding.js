const permanent = location.hash === "#permanent";
document.getElementById("permanent").hidden = !permanent;
document.getElementById("access").hidden = permanent;
