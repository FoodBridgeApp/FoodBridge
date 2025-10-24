// frontend.js

// loader
function showLoader() {
  document.getElementById("loader").style.display = "block";
}
function hideLoader() {
  document.getElementById("loader").style.display = "none";
}

// cart
let cart = JSON.parse(localStorage.getItem("foodbridge_cart")) || [];

function addToCart(item) {
  cart.push(item);
  localStorage.setItem("foodbridge_cart", JSON.stringify(cart));
  renderCart();
}

function renderCart() {
  const cartDiv = document.getElementById("cart");
  cartDiv.innerHTML = "";
  cart.forEach((item, idx) => {
    cartDiv.innerHTML += `<div>${idx + 1}. ${item}</div>`;
  });
}

// print
function printPlan() {
  const plan = document.getElementById("plan-container");
  const win = window.open("", "", "width=900,height=650");
  win.document.write("<html><head><title>FoodBridge Plan</title></head><body>");
  win.document.write(plan.innerHTML);
  win.document.write("</body></html>");
  win.document.close();
  win.print();
}
