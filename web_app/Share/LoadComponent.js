document.addEventListener("DOMContentLoaded", function () {

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
                activeSidebarItem();
            });
    }

    function activeSidebarItem() {
    let currentPath = window.location.pathname.split("/").pop();
    if (currentPath === "") currentPath = "index.html";
    
    const menubtn = document.querySelectorAll(".menu-btn");

    menubtn.forEach(btn => { 
        const btnPath = btn.getAttribute("href");
        btn.classList.remove("active");
        if (btnPath === currentPath && btn.id !== "logout-btn") {
            btn.classList.add("active");
        }
    });
    }

    function applyTheme() {
        const savedTheme = localStorage.getItem('SCFT_Theme') || 'light';

        if (savedTheme === 'dark') {
            document.body.classList.add('dark-mode');
        }
        else {
            document.body.classList.remove('dark-mode');
        }

        setTimeout(()=> {
            const darkRadio = document.getElementById('theme_dark');
            const lightRadio = document.getElementById('theme_light');
            if (savedTheme === 'dark' && darkRadio) {
                darkRadio.checked = true;
            } else if (savedTheme === 'light' && lightRadio) {
                lightRadio.checked = true;
            }
        }, 100);
    }
    applyTheme();

})