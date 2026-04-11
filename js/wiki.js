window.wiki = {
    init() {
        this.container = document.getElementById('wiki-content');
        if(this.container) this.render();
    },

    render() {
        if (!this.container) {
            this.container = document.getElementById('wiki-content');
            if (!this.container) return;
        }

        const articles = window.app.state.knowledgeBase || [];
        
        let html = `
            <div class="section-header">
                <div>
                    <h1>Technician Knowledge Base</h1>
                    <p style="color: #a0a0a0; margin-top: 4px;">Internal technical documentation, fix procedures, and standard configs.</p>
                </div>
                <div style="display: flex; gap: 12px;">
                    <button class="btn-primary" onclick="wiki.showAddArticleModal()"><span class="material-symbols-outlined">edit_note</span> Post Article</button>
                </div>
            </div>

            <div class="glass-card" style="padding: 24px; margin-bottom: 24px;">
                <div class="search-bar" style="max-width: 100%; margin: 0; background: rgba(255,255,255,0.05); border: 1px solid var(--border);">
                    <span class="material-symbols-outlined">search</span>
                    <input type="text" placeholder="Search for error codes, software names, or fix procedures..." id="wiki-search" oninput="wiki.filterArticles()">
                </div>
            </div>

            <div id="wiki-articles-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 20px;">
                ${this.renderArticles()}
            </div>
        `;

        this.container.innerHTML = html;
    },

    renderArticles(filter = '') {
        const list = window.app.state.knowledgeBase || [];
        const filtered = list.filter(a => {
            const searchStr = `${a.title} ${a.tags} ${a.category}`.toLowerCase();
            return searchStr.includes(filter.toLowerCase());
        });

        if(filtered.length === 0) {
            return `<div style="grid-column: 1/-1; text-align: center; color: #a0a0a0; padding: 60px;">No articles found matching your search.</div>`;
        }

        return filtered.sort((a, b) => new Date(b.date) - new Date(a.date)).map(a => `
            <div class="glass-card article-card" style="padding: 20px; transition: transform 0.2s; cursor: pointer;" onclick="wiki.viewArticle('${a.id}')">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                    <span class="badge" style="background: rgba(var(--accent-rgb), 0.1); color: var(--accent); border: 1px solid var(--accent);">${a.category}</span>
                    <div style="font-size: 0.75rem; color: #a0a0a0;">${new Date(a.date).toLocaleDateString()}</div>
                </div>
                <h3 style="margin: 0 0 10px 0; font-size: 1.1rem; line-height: 1.4;">${a.title}</h3>
                <p style="color: #a0a0a0; font-size: 0.9rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-bottom: 20px;">
                    ${this.stripMarkdown(a.content)}
                </p>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="display: flex; gap: 4px;">
                        ${(a.tags || '').split(',').map(t => t.trim() ? `<span style="font-size: 0.7rem; color: #808080;">#${t.trim()}</span>` : '').join(' ')}
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px; color: var(--primary); font-size: 0.85rem; font-weight: 500;">
                        Read More <span class="material-symbols-outlined" style="font-size: 1rem;">arrow_forward</span>
                    </div>
                </div>
            </div>
        `).join('');
    },

    stripMarkdown(text) {
        return text.replace(/[#*`]/g, '').substring(0, 150);
    },

    filterArticles() {
        const query = document.getElementById('wiki-search').value;
        const grid = document.getElementById('wiki-articles-grid');
        if(grid) grid.innerHTML = this.renderArticles(query);
    },

    showAddArticleModal() {
        const modalHTML = `
            <div class="modal-content" style="max-width: 800px; width: 95%;">
                <div class="modal-header">
                    <h2>Post Knowledge Article</h2>
                    <button class="btn-icon" onclick="app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body">
                    <form id="add-article-form" onsubmit="wiki.handleAddArticle(event)">
                        <div class="form-group">
                            <label>Article Title</label>
                            <input type="text" id="wiki-title" class="form-control" placeholder="e.g. How to Reset Outlook Profile (OST Fix)" required>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Category</label>
                                <select id="wiki-cat" class="form-control" style="appearance: auto;" required>
                                    <option value="Windows">Windows / OS</option>
                                    <option value="Networking">Networking</option>
                                    <option value="Software">Software & Apps</option>
                                    <option value="Hardware">Hardware Repair</option>
                                    <option value="Printers">Printers / Scanners</option>
                                    <option value="SOP">SOP / General</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Search Tags (Comma separated)</label>
                                <input type="text" id="wiki-tags" class="form-control" placeholder="outlook, email, fix, profile">
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Content (Basic formatting like # for headers, \`code\` supported)</label>
                            <textarea id="wiki-content-text" class="form-control" rows="12" placeholder="Write your technical guide here..." required></textarea>
                        </div>

                        <div class="modal-footer" style="padding: 0; margin-top: 24px;">
                            <button type="button" class="btn-secondary" onclick="app.closeModal()">Cancel</button>
                            <button type="submit" class="btn-primary" style="flex: 2; justify-content: center;">Publish Article</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        window.app.showModal(modalHTML);
    },

    async handleAddArticle(e) {
        e.preventDefault();
        const title = document.getElementById('wiki-title').value;
        const cat = document.getElementById('wiki-cat').value;
        const tags = document.getElementById('wiki-tags').value;
        const content = document.getElementById('wiki-content-text').value;

        try {
            const id = 'WIKI-' + Date.now();
            await window.fbDb.collection('knowledgeBase').doc(id).set({
                id, title, category: cat, tags, content,
                author: window.app.state.user?.name || 'Technician',
                date: new Date().toISOString(),
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            window.app.closeModal();
            alert("Article published to Tech Wiki!");
        } catch(err) {
            alert("Failed to save article.");
        }
    },

    viewArticle(id) {
        const a = window.app.state.knowledgeBase.find(art => art.id === id);
        if(!a) return;

        const renderedContent = this.parseMarkdown(a.content);

        const modalHTML = `
            <div class="modal-content" style="max-width: 900px; width: 95%; height: 90vh; display: flex; flex-direction: column;">
                <div class="modal-header">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <span class="badge" style="background: rgba(var(--accent-rgb), 0.1); color: var(--accent);">${a.category}</span>
                        <h2 style="margin: 0;">${a.title}</h2>
                    </div>
                    <button class="btn-icon" onclick="app.closeModal()"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="modal-body" style="flex: 1; overflow-y: auto; padding: 30px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; border-bottom: 1px solid var(--border); padding-bottom: 15px;">
                        <div style="display: flex; align-items: center; gap: 8px; color: #a0a0a0; font-size: 0.9rem;">
                            <span class="material-symbols-outlined" style="font-size: 1.2rem;">person</span> Posted by ${a.author}
                            <span style="margin: 0 8px;">•</span>
                            <span class="material-symbols-outlined" style="font-size: 1.2rem;">calendar_today</span> ${new Date(a.date).toLocaleDateString()}
                        </div>
                        <button class="btn-icon" style="color: var(--danger);" onclick="wiki.deleteArticle('${a.id}')"><span class="material-symbols-outlined">delete</span></button>
                    </div>
                    
                    <div class="wiki-rich-content" style="line-height: 1.7; color: #e0e0e0; font-size: 1.05rem;">
                        ${renderedContent}
                    </div>

                    <div style="margin-top: 50px; border-top: 1px solid var(--border); padding-top: 20px;">
                        <div style="font-size: 0.8rem; color: #808080; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px;">Related Tags</div>
                        <div style="display: flex; gap: 8px;">
                            ${(a.tags || '').split(',').map(t => `<span class="badge" style="background: rgba(255,255,255,0.03); color: #a0a0a0;">#${t.trim()}</span>`).join('')}
                        </div>
                    </div>
                </div>
            </div>
        `;
        window.app.showModal(modalHTML);
    },

    parseMarkdown(text) {
        // Simple regex-based markdown parser
        return text
            .replace(/^# (.*$)/gm, '<h1 style="color: var(--primary); margin: 25px 0 15px 0; border-bottom: 1px solid rgba(var(--primary-rgb), 0.2); padding-bottom: 10px;">$1</h1>')
            .replace(/^## (.*$)/gm, '<h2 style="color: var(--accent); margin: 20px 0 10px 0;">$1</h2>')
            .replace(/^### (.*$)/gm, '<h3 style="color: #ffffff; margin: 15px 0 8px 0;">$1</h3>')
            .replace(/\*\*(.*)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*)\*/g, '<em>$1</em>')
            .replace(/`(.*)`/g, '<code style="background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px; font-family: monospace; color: var(--warning); border: 1px solid rgba(253,203,110,0.2);">$1</code>')
            .replace(/^- (.*$)/gm, '<li style="margin-left: 20px; margin-bottom: 5px;">$1</li>')
            .replace(/\n\n/g, '<div style="margin-bottom: 15px;"></div>')
            .replace(/\n/g, '<br>');
    },

    async deleteArticle(id) {
        if(!confirm("Are you sure you want to delete this technical article?")) return;
        try {
            await window.fbDb.collection('knowledgeBase').doc(id).delete();
            window.app.closeModal();
            alert("Article removed.");
        } catch(err) {
            alert("Delete failed.");
        }
    }
};
