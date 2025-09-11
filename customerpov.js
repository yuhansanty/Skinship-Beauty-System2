
    // Open tab function
    function openTab(evt, tabName) {
      const tabContents = document.getElementsByClassName("tab-content");
      for (let i = 0; i < tabContents.length; i++) {
        tabContents[i].classList.remove("active");
      }

      const tabButtons = document.getElementsByClassName("tab-button");
      for (let i = 0; i < tabButtons.length; i++) {
        tabButtons[i].classList.remove("active");
      }

      document.getElementById(tabName).classList.add("active");
      evt.currentTarget.classList.add("active");
    }

    // Set the first tab as active by default
    document.addEventListener('DOMContentLoaded', function() {
      document.querySelector('.tab-button').classList.add('active');
      document.querySelector('.tab-content').classList.add('active');
    });
