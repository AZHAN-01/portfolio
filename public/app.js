document.addEventListener('DOMContentLoaded', () => {
  const API_URL = "https://portfolio-production-6f92.up.railway.app";
  // Application State
  const state = {
    projects: [],
    certificates: [],
    isAdmin: false,
    selectedProject: null
  };

  // DOM Elements
  const projectsContainer = document.getElementById('projects-container');
  const certificatesContainer = document.getElementById('certificates-container');
  const adminNavBtn = document.getElementById('admin-nav-btn');
  const adminControls = document.getElementById('admin-controls');
  const adminLogoutBtn = document.getElementById('admin-logout-btn');
  const addProjectForm = document.getElementById('add-project-form');
  const addCertificateForm = document.getElementById('add-certificate-form');

  // Modals
  const redirectModal = document.getElementById('redirect-modal');
  const closeRedirectModal = document.getElementById('close-redirect-modal');
  const btnOpenWebsite = document.getElementById('btn-open-website');
  const btnOpenGithub = document.getElementById('btn-open-github');
  const redirectTitle = document.getElementById('redirect-title');

  const loginModal = document.getElementById('login-modal');
  const closeLoginModal = document.getElementById('close-login-modal');
  const adminLoginForm = document.getElementById('admin-login-form');
  const adminPasswordInput = document.getElementById('admin-password-input');
  const loginErrorMsg = document.getElementById('login-error-msg');

  const setupModal = document.getElementById('setup-modal');
  const forgotPasswordModal = document.getElementById('forgot-password-modal');
  const verifyCodeModal = document.getElementById('verify-code-modal');
  const resetPasswordModal = document.getElementById('reset-password-modal');

  const imageModal = document.getElementById('image-modal');
  const closeImageModal = document.getElementById('close-image-modal');
  const fullSizeImage = document.getElementById('full-size-image');
  const imageModalTitle = document.getElementById('image-modal-title');

  // Check Auth State on Startup
  checkAuthentication();
  fetchProjects();
  fetchCertificates();
  fetchProfilePic();

  // Navigation Active Class Toggle
  const navLinks = document.querySelectorAll('.nav-link');
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      navLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
    });
  });

  // Modal Open & Close Functions
  function openModal(modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeModal(modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }

  // Close modals on clicking outer area
  window.addEventListener('click', (e) => {
    if (e.target === redirectModal) closeModal(redirectModal);
    if (e.target === loginModal) closeModal(loginModal);
    if (e.target === setupModal) closeModal(setupModal);
    if (e.target === forgotPasswordModal) closeModal(forgotPasswordModal);
    if (e.target === verifyCodeModal) closeModal(verifyCodeModal);
    if (e.target === resetPasswordModal) closeModal(resetPasswordModal);
    if (e.target === imageModal) closeModal(imageModal);
  });

  closeRedirectModal.addEventListener('click', () => closeModal(redirectModal));
  closeLoginModal.addEventListener('click', () => closeModal(loginModal));
  document.getElementById('close-setup-modal').addEventListener('click', () => closeModal(setupModal));
  document.getElementById('close-forgot-password-modal').addEventListener('click', () => closeModal(forgotPasswordModal));
  document.getElementById('close-verify-code-modal').addEventListener('click', () => closeModal(verifyCodeModal));
  document.getElementById('close-reset-password-modal').addEventListener('click', () => closeModal(resetPasswordModal));
  if (closeImageModal) closeImageModal.addEventListener('click', () => closeModal(imageModal));

  // Admin Nav Button Actions
  adminNavBtn.addEventListener('click', async () => {
    if (state.isAdmin) {
      // Scroll to Admin section
      document.getElementById('projects').scrollIntoView({ behavior: 'smooth' });
    } else {
      try {
        const res = await fetch(`${API_URL}/api/auth/setup-status`);
        const data = await res.json();
        if (data.needsSetup) {
          openModal(setupModal);
        } else {
          openModal(loginModal);
          adminPasswordInput.focus();
        }
      } catch (err) {
        openModal(loginModal);
      }
    }
  });

  // Authentication API Calls
  async function checkAuthentication() {
    const token = localStorage.getItem('adminToken');
    if (!token) {
      setAdminState(false);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/auth/check`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      setAdminState(data.authenticated);
      if (!data.authenticated) {
        localStorage.removeItem('adminToken');
      }
    } catch (err) {
      console.error('Authentication verification error:', err);
      setAdminState(false);
    }
  }

  function setAdminState(isAdmin) {
    state.isAdmin = isAdmin;
    if (isAdmin) {
      adminNavBtn.innerHTML = '<i class="fa-solid fa-screwdriver-wrench"></i> Admin Panel';
      adminControls.classList.remove('hidden');
    } else {
      adminNavBtn.innerHTML = '<i class="fa-solid fa-lock"></i> Admin Login';
      adminControls.classList.add('hidden');
    }
    // Re-render project & certificate cards to show/hide delete buttons
    renderProjects();
    renderCertificates();
  }

  // Handle Admin Login Form Submission
  adminLoginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginErrorMsg.classList.add('hidden');
    const password = adminPasswordInput.value;

    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      
      if (data.success) {
        localStorage.setItem('adminToken', data.token);
        setAdminState(true);
        closeModal(loginModal);
        adminPasswordInput.value = '';
        // Scroll to admin controls smoothly
        setTimeout(() => {
          adminControls.scrollIntoView({ behavior: 'smooth' });
        }, 300);
      } else {
        loginErrorMsg.classList.remove('hidden');
      }
    } catch (err) {
      console.error('Login error:', err);
      loginErrorMsg.textContent = 'Server connection error.';
      loginErrorMsg.classList.remove('hidden');
    }
  });

  // 1. Setup Admin Form
  document.getElementById('admin-setup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('setup-email-input').value;
    const password = document.getElementById('setup-password-input').value;
    const errorMsg = document.getElementById('setup-error-msg');
    errorMsg.classList.add('hidden');
    try {
      const res = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('adminToken', data.token);
        setAdminState(true);
        closeModal(setupModal);
        document.getElementById('setup-email-input').value = '';
        document.getElementById('setup-password-input').value = '';
        setTimeout(() => {
          adminControls.scrollIntoView({ behavior: 'smooth' });
        }, 300);
      } else {
        errorMsg.textContent = data.message;
        errorMsg.classList.remove('hidden');
      }
    } catch (err) {
      errorMsg.textContent = 'Network error.';
      errorMsg.classList.remove('hidden');
    }
  });

  // 2. Forgot Password Flow State
  let resetFlowEmail = '';

  document.getElementById('link-forgot-password').addEventListener('click', (e) => {
    e.preventDefault();
    closeModal(loginModal);
    openModal(forgotPasswordModal);
  });

  document.getElementById('forgot-password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('forgot-email-input').value;
    const errorMsg = document.getElementById('forgot-error-msg');
    const btn = document.getElementById('btn-forgot-send');
    
    errorMsg.classList.add('hidden');
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Sending...';
    btn.disabled = true;

    try {
      const res = await fetch(`${API_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (data.success) {
        resetFlowEmail = email;
        closeModal(forgotPasswordModal);
        openModal(verifyCodeModal);
      } else {
        errorMsg.textContent = data.message;
        errorMsg.classList.remove('hidden');
      }
    } catch (err) {
      errorMsg.textContent = 'Network error.';
      errorMsg.classList.remove('hidden');
    } finally {
      btn.innerHTML = 'Send Code';
      btn.disabled = false;
    }
  });

  document.getElementById('verify-code-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = document.getElementById('verify-code-input').value;
    const errorMsg = document.getElementById('verify-error-msg');
    errorMsg.classList.add('hidden');
    
    try {
      const res = await fetch(`${API_URL}/api/auth/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetFlowEmail, code })
      });
      const data = await res.json();
      if (data.success) {
        closeModal(verifyCodeModal);
        openModal(resetPasswordModal);
      } else {
        errorMsg.textContent = data.message;
        errorMsg.classList.remove('hidden');
      }
    } catch (err) {
      errorMsg.textContent = 'Network error.';
      errorMsg.classList.remove('hidden');
    }
  });

  document.getElementById('reset-password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = document.getElementById('verify-code-input').value; // from previous modal
    const newPassword = document.getElementById('new-password-input').value;
    const errorMsg = document.getElementById('reset-error-msg');
    errorMsg.classList.add('hidden');
    
    try {
      const res = await fetch(`${API_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetFlowEmail, code, newPassword })
      });
      const data = await res.json();
      if (data.success) {
        closeModal(resetPasswordModal);
        alert('Password reset successful! Please login with your new password.');
        document.getElementById('verify-code-input').value = '';
        document.getElementById('new-password-input').value = '';
        openModal(loginModal);
      } else {
        errorMsg.textContent = data.message;
        errorMsg.classList.remove('hidden');
      }
    } catch (err) {
      errorMsg.textContent = 'Network error.';
      errorMsg.classList.remove('hidden');
    }
  });

  // Admin Logout Handler
  adminLogoutBtn.addEventListener('click', () => {
    localStorage.removeItem('adminToken');
    setAdminState(false);
  });

  // Fetch Projects from Database
  async function fetchProjects() {
    try {
      const res = await fetch(`${API_URL}/api/projects`);
      state.projects = await res.json();
      renderProjects();
    } catch (err) {
      console.error('Failed to load projects:', err);
      projectsContainer.innerHTML = `
        <div class="loader-container">
          <i class="fa-solid fa-triangle-exclamation" style="font-size: 2.5rem; color: #ff5555; margin-bottom: 1rem;"></i>
          <p>Failed to connect to database. Ensure MySQL (XAMPP) is running.</p>
        </div>
      `;
    }
  }

  // Render Projects Grid
  function renderProjects() {
    if (state.projects.length === 0) {
      projectsContainer.innerHTML = `
        <div class="loader-container">
          <i class="fa-solid fa-folder-open" style="font-size: 2.5rem; color: var(--text-muted); margin-bottom: 1rem;"></i>
          <p>No projects added yet. ${state.isAdmin ? 'Use the admin dashboard above to add one!' : ''}</p>
        </div>
      `;
      return;
    }

    projectsContainer.innerHTML = '';
    state.projects.forEach(project => {
      const card = document.createElement('div');
      card.className = 'project-card';
      
      // Split tags by comma
      const tagsHTML = project.tech_stack 
        ? project.tech_stack.split(',').map(tag => `<span class="project-tag">${tag.trim()}</span>`).join('')
        : '';

      // Delete Button only if admin is logged in
      const deleteBtnHTML = state.isAdmin 
        ? `<button class="btn btn-sm btn-danger delete-project-btn" data-id="${project.id}">
             <i class="fa-solid fa-trash-can"></i> Delete
           </button>`
        : '';

      const imageHTML = project.image_url 
        ? `<img src="${project.image_url}" class="project-image" alt="Project Cover">` 
        : '';

      card.innerHTML = `
        ${imageHTML}
        <div class="project-card-header">
          <i class="fa-solid fa-code-branch" style="font-size: 1.5rem; color: var(--accent-cyan);"></i>
          ${deleteBtnHTML}
        </div>
        <h3 class="project-title">${escapeHTML(project.title)}</h3>
        <div class="project-tags">
          ${tagsHTML}
        </div>
        <p class="project-desc">${escapeHTML(project.description)}</p>
        <div class="project-card-footer">
          <span class="project-action-indicator">Explore Project <i class="fa-solid fa-arrow-right-long"></i></span>
        </div>
      `;

      // Card Click Listener (Only trigger redirect modal if not clicking delete button)
      card.addEventListener('click', (e) => {
        if (e.target.closest('.delete-project-btn')) return;
        state.selectedProject = project;
        redirectTitle.textContent = project.title;
        openModal(redirectModal);
      });

      projectsContainer.appendChild(card);
    });

    // Add event listeners to delete buttons
    document.querySelectorAll('.delete-project-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        if (confirm('Are you sure you want to delete this project?')) {
          await deleteProject(id);
        }
      });
    });
  }

  // Add Project API Call
  addProjectForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('adminToken');
    if (!token) return alert('Session expired or admin access unauthorized.');

    const formData = new FormData();
    formData.append('title', document.getElementById('proj-title').value);
    formData.append('tech_stack', document.getElementById('proj-tech').value);
    formData.append('web_link', document.getElementById('proj-web').value);
    formData.append('github_link', document.getElementById('proj-github').value);
    formData.append('description', document.getElementById('proj-desc').value);
    
    const imageFile = document.getElementById('proj-image').files[0];
    if (imageFile) {
      formData.append('image', imageFile);
    }

    try {
      const res = await fetch(`${API_URL}/api/projects`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      const data = await res.json();
      
      if (data.success) {
        addProjectForm.reset();
        await fetchProjects(); // Reload projects list
        alert('Project added successfully!');
      } else {
        alert('Failed to add project: ' + data.message);
      }
    } catch (err) {
      console.error('Error adding project:', err);
      alert('Network connection error.');
    }
  });

  // Delete Project API Call
  async function deleteProject(id) {
    const token = localStorage.getItem('adminToken');
    if (!token) return alert('Session expired or admin access unauthorized.');

    try {
      const res = await fetch(`${API_URL}/api/projects/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();

      if (data.success) {
        await fetchProjects(); // Reload projects list
      } else {
        alert('Failed to delete project: ' + data.message);
      }
    } catch (err) {
      console.error('Error deleting project:', err);
      alert('Network connection error.');
    }
  }

  // Fetch Certificates from Database
  async function fetchCertificates() {
    try {
      const res = await fetch(`${API_URL}/api/certificates`);
      state.certificates = await res.json();
      renderCertificates();
    } catch (err) {
      console.error('Failed to load certificates:', err);
      certificatesContainer.innerHTML = `
        <div class="loader-container">
          <i class="fa-solid fa-triangle-exclamation" style="font-size: 2.5rem; color: #ff5555; margin-bottom: 1rem;"></i>
          <p>Failed to load certificates.</p>
        </div>
      `;
    }
  }

  // Render Certificates Grid
  function renderCertificates() {
    if (state.certificates.length === 0) {
      certificatesContainer.innerHTML = `
        <div class="loader-container">
          <i class="fa-solid fa-certificate" style="font-size: 2.5rem; color: var(--text-muted); margin-bottom: 1rem;"></i>
          <p>No certificates added yet. ${state.isAdmin ? 'Use the admin dashboard above to add one!' : ''}</p>
        </div>
      `;
      return;
    }

    certificatesContainer.innerHTML = '';
    state.certificates.forEach(cert => {
      const card = document.createElement('div');
      card.className = 'project-card'; // Reuse project card styling
      card.style.cursor = 'pointer'; // Indicate it's clickable
      
      const deleteBtnHTML = state.isAdmin 
        ? `<button class="btn btn-sm btn-danger delete-certificate-btn" data-id="${cert.id}" style="position: absolute; top: 1rem; right: 1rem; z-index: 10;">
             <i class="fa-solid fa-trash-can"></i> Delete
           </button>`
        : '';

      const imageHTML = cert.image_url 
        ? `<div style="position: relative;">
             <img src="${cert.image_url}" class="project-image" alt="${escapeHTML(cert.title)}">
           </div>` 
        : '';

      card.innerHTML = `
        <div style="position: relative;">
          ${deleteBtnHTML}
          ${imageHTML}
        </div>
        <div style="padding: 1.5rem;">
          <h3 class="project-title" style="margin-top: 0; margin-bottom: 0.5rem;">${escapeHTML(cert.title)}</h3>
          <p class="project-desc" style="color: var(--accent-cyan); font-weight: 500; font-size: 0.9rem; margin-bottom: 0;">
            <i class="fa-solid fa-award"></i> ${escapeHTML(cert.issuer || 'Issuer')}
          </p>
        </div>
      `;

      // Handle card click to open image modal
      card.addEventListener('click', (e) => {
        if (e.target.closest('.delete-certificate-btn')) return;
        fullSizeImage.src = cert.image_url;
        imageModalTitle.textContent = cert.title;
        openModal(imageModal);
      });

      certificatesContainer.appendChild(card);
    });

    // Add event listeners to certificate delete buttons
    document.querySelectorAll('.delete-certificate-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        if (confirm('Are you sure you want to delete this certificate?')) {
          await deleteCertificate(id);
        }
      });
    });
  }

  // Add Certificate Form Handling
  if (addCertificateForm) {
    addCertificateForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const token = localStorage.getItem('adminToken');
      if (!token) return alert('Session expired or admin access unauthorized.');

      const formData = new FormData();
      formData.append('title', document.getElementById('cert-title').value);
      formData.append('issuer', document.getElementById('cert-issuer').value);
      
      const imageFile = document.getElementById('cert-image').files[0];
      if (imageFile) {
        formData.append('image', imageFile);
      } else {
        return alert('Please select a certificate image.');
      }

      try {
        const res = await fetch(`${API_URL}/api/certificates`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
        });
        const data = await res.json();
        
        if (data.success) {
          addCertificateForm.reset();
          await fetchCertificates(); // Reload certificates
          alert('Certificate added successfully!');
        } else {
          alert('Failed to add certificate: ' + data.message);
        }
      } catch (err) {
        console.error('Error adding certificate:', err);
        alert('Network connection error.');
      }
    });
  }

  // Delete Certificate API Call
  async function deleteCertificate(id) {
    const token = localStorage.getItem('adminToken');
    if (!token) return alert('Session expired or admin access unauthorized.');

    try {
      const res = await fetch(`${API_URL}/api/certificates/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();

      if (data.success) {
        await fetchCertificates(); // Reload list
      } else {
        alert('Failed to delete certificate: ' + data.message);
      }
    } catch (err) {
      console.error('Error deleting certificate:', err);
      alert('Network connection error.');
    }
  }

  // Redirect Button Link handlers
  btnOpenWebsite.addEventListener('click', () => {
    if (state.selectedProject && state.selectedProject.web_link) {
      window.open(state.selectedProject.web_link, '_blank');
      closeModal(redirectModal);
    } else {
      alert('Live link is not available.');
    }
  });

  btnOpenGithub.addEventListener('click', () => {
    if (state.selectedProject && state.selectedProject.github_link) {
      window.open(state.selectedProject.github_link, '_blank');
      closeModal(redirectModal);
    } else {
      alert('GitHub link is not available.');
    }
  });

  // Helper to escape HTML tags to prevent XSS
  function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
      tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      }[tag] || tag)
    );
  }

  // Handle Contact Form Submission via AJAX (Formspree)
  const contactForm = document.getElementById('contact-form');
  if (contactForm) {
    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const submitBtn = contactForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerHTML;
      
      // Visual feedback for sending
      submitBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Sending...';
      submitBtn.disabled = true;
      
      const formData = new FormData(contactForm);
      
      try {
        const response = await fetch(contactForm.action, {
          method: contactForm.method,
          body: formData,
          headers: {
            'Accept': 'application/json'
          }
        });
        
        if (response.ok) {
          // Success State
          submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> Message Sent!';
          submitBtn.style.background = 'linear-gradient(135deg, #27c93f 0%, #1e9e30 100%)';
          submitBtn.style.boxShadow = '0 4px 15px rgba(39, 201, 63, 0.3)';
          contactForm.reset();
        } else {
          // Error state from Formspree
          const data = await response.json();
          let errorMessage = 'Failed to send.';
          if (data && Object.hasOwn(data, 'errors')) {
            errorMessage = data.errors.map(error => error.message).join(', ');
          }
          submitBtn.innerHTML = `<i class="fa-solid fa-xmark"></i> ${errorMessage}`;
          submitBtn.style.background = '#ff5555';
        }
      } catch (error) {
        submitBtn.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Network Error';
        submitBtn.style.background = '#ff5555';
      }
      
      // Reset button after 4 seconds
      setTimeout(() => {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
        submitBtn.style.background = '';
        submitBtn.style.boxShadow = '';
      }, 4000);
    });
  }

  async function fetchProfilePic() {
    try {
      const res = await fetch(`${API_URL}/api/settings/profile-pic`);
      const data = await res.json();
      if (data.success && data.url) {
        document.getElementById('profile-pic').src = data.url;
      }
    } catch (err) {
      console.error('Failed to fetch profile picture:', err);
    }
  }

  const updateProfileForm = document.getElementById('update-profile-form');
  if (updateProfileForm) {
    updateProfileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const token = localStorage.getItem('adminToken');
      if (!token) return alert('Session expired or admin access unauthorized.');
      
      const fileInput = document.getElementById('hero-img-upload');
      if (!fileInput.files[0]) return alert('Please select a file.');

      const formData = new FormData();
      formData.append('image', fileInput.files[0]);

      try {
        const res = await fetch(`${API_URL}/api/settings/profile-pic`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
        });
        const data = await res.json();
        if (data.success) {
          updateProfileForm.reset();
          document.getElementById('profile-pic').src = data.url + '?t=' + new Date().getTime(); // Cache buster
          alert('Profile picture updated successfully!');
        } else {
          alert('Failed to update picture: ' + data.message);
        }
      } catch (err) {
        alert('Network connection error.');
      }
    });
  }
});
