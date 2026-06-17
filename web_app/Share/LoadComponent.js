document.addEventListener("DOMContentLoaded", function() {

    const roSidebar = document.getElementById("sidebar-container");
    if (roSidebar) {
        fetch("component/SideBar/Sidebar.html")
            .then(response => response.text())
            .then(html => {
                roSidebar.innerHTML = html;
            });
    }
    
    const roHeader = document.getElementById("header-container");
    if (roHeader) {
        fetch("component/header/Header.html")
            .then(response => response.text())
            .then(html => {
                roHeader.innerHTML = html;
            });
    }
})