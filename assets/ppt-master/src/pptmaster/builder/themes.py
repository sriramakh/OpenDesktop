"""Template themes — 10 industry-specific color/content configurations."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from pptmaster.assets.color_utils import tint, shade
from pptmaster.builder.ux_styles import UXStyle, CLASSIC


@dataclass
class TemplateTheme:
    """Complete theme configuration for a corporate template."""

    key: str
    company_name: str
    industry: str
    tagline: str

    # Core colors (60-30-10)
    primary: str        # 60% - main dark color
    accent: str         # 10% - premium accent
    secondary: str      # 30% - secondary text
    light_bg: str       # Light background

    # 6-color accent palette for charts, cards, etc.
    palette: list[str] = field(default_factory=list)

    # Font
    font: str = "Inter"

    # UX Style — controls layout, card appearance, slide variants
    ux_style: UXStyle = field(default_factory=lambda: CLASSIC)

    # All slide content keyed by slide name
    content: dict[str, Any] = field(default_factory=dict)

    # Computed tints
    def primary_tint(self, factor: float = 0.95) -> str:
        return tint(self.primary, factor)

    def accent_tint(self, factor: float = 0.90) -> str:
        return tint(self.accent, factor)

    def palette_tint(self, idx: int, factor: float = 0.90) -> str:
        return tint(self.palette[idx % len(self.palette)], factor)


# ── Theme Factories ────────────────────────────────────────────────────


def _default_theme() -> TemplateTheme:
    from pptmaster.builder.ux_styles import CLASSIC
    return TemplateTheme(
        key="corporate", company_name="[Company Name]", industry="General Corporate",
        tagline="Strategic Overview & Key Initiatives",
        primary="#1B2A4A", accent="#C8A951", secondary="#64748B", light_bg="#F1F5F9",
        palette=["#3B82F6", "#10B981", "#EF4444", "#8B5CF6", "#F59E0B", "#14B8A6"],
        ux_style=CLASSIC,
        content=_corporate_content("[Company Name]"),
    )


def _healthcare_theme() -> TemplateTheme:
    from pptmaster.builder.ux_styles import MINIMAL
    return TemplateTheme(
        key="healthcare", company_name="MedTech Solutions", industry="Healthcare",
        tagline="Advancing Patient Outcomes Through Innovation",
        primary="#0F4C5C", accent="#E36414", secondary="#5B8A72", light_bg="#F0FDF4",
        palette=["#0D9488", "#10B981", "#EF4444", "#6366F1", "#F97316", "#06B6D4"],
        ux_style=MINIMAL,
        content=_healthcare_content(),
    )


def _technology_theme() -> TemplateTheme:
    from pptmaster.builder.ux_styles import DARK
    return TemplateTheme(
        key="technology", company_name="NexTech Systems", industry="Technology",
        tagline="Engineering the Future of Enterprise Software",
        primary="#0F172A", accent="#06B6D4", secondary="#475569", light_bg="#F0F9FF",
        palette=["#2563EB", "#10B981", "#EF4444", "#8B5CF6", "#F59E0B", "#06B6D4"],
        ux_style=DARK,
        content=_technology_content(),
    )


def _finance_theme() -> TemplateTheme:
    from pptmaster.builder.ux_styles import ELEVATED
    return TemplateTheme(
        key="finance", company_name="Meridian Capital", industry="Finance",
        tagline="Building Wealth Through Strategic Vision",
        primary="#14532D", accent="#D4AF37", secondary="#57534E", light_bg="#F5F5F4",
        palette=["#166534", "#0D9488", "#DC2626", "#7C3AED", "#D97706", "#0891B2"],
        ux_style=ELEVATED,
        content=_finance_content(),
    )


def _education_theme() -> TemplateTheme:
    from pptmaster.builder.ux_styles import BOLD
    return TemplateTheme(
        key="education", company_name="Horizon University", industry="Education",
        tagline="Shaping Tomorrow's Leaders Today",
        primary="#881337", accent="#D4A574", secondary="#6B7280", light_bg="#FFF7ED",
        palette=["#B91C1C", "#059669", "#2563EB", "#7C3AED", "#D97706", "#0891B2"],
        ux_style=BOLD,
        content=_education_content(),
    )


def _sustainability_theme() -> TemplateTheme:
    from pptmaster.builder.ux_styles import EDITORIAL
    return TemplateTheme(
        key="sustainability", company_name="EcoForward Group", industry="Sustainability",
        tagline="Driving Impact Through Responsible Growth",
        primary="#064E3B", accent="#92400E", secondary="#6B7280", light_bg="#ECFDF5",
        palette=["#059669", "#10B981", "#D97706", "#7C3AED", "#0891B2", "#65A30D"],
        ux_style=EDITORIAL,
        content=_sustainability_content(),
    )


def _luxury_theme() -> TemplateTheme:
    from pptmaster.builder.ux_styles import GRADIENT
    return TemplateTheme(
        key="luxury", company_name="Maison Luxe", industry="Luxury & Fashion",
        tagline="Crafting Timeless Experiences",
        primary="#1A1A2E", accent="#B76E79", secondary="#78716C", light_bg="#FAF5F3",
        palette=["#B76E79", "#9F7AEA", "#2563EB", "#0D9488", "#D97706", "#E11D48"],
        ux_style=GRADIENT,
        content=_luxury_content(),
    )


def _startup_theme() -> TemplateTheme:
    from pptmaster.builder.ux_styles import SPLIT
    return TemplateTheme(
        key="startup", company_name="Velocity Ventures", industry="Startup / VC",
        tagline="Accelerating Ideas Into Market Leaders",
        primary="#3B0764", accent="#EA580C", secondary="#6B7280", light_bg="#FDF4FF",
        palette=["#7C3AED", "#10B981", "#EF4444", "#2563EB", "#F59E0B", "#06B6D4"],
        ux_style=SPLIT,
        content=_startup_content(),
    )


def _government_theme() -> TemplateTheme:
    from pptmaster.builder.ux_styles import GEO
    return TemplateTheme(
        key="government", company_name="National Infrastructure Agency", industry="Government",
        tagline="Serving the Public With Transparency and Accountability",
        primary="#1E3A5F", accent="#B91C1C", secondary="#6B7280", light_bg="#EFF6FF",
        palette=["#1D4ED8", "#059669", "#B91C1C", "#7C3AED", "#D97706", "#0891B2"],
        ux_style=GEO,
        content=_government_content(),
    )


def _realestate_theme() -> TemplateTheme:
    from pptmaster.builder.ux_styles import RETRO
    return TemplateTheme(
        key="realestate", company_name="Pinnacle Properties", industry="Real Estate",
        tagline="Building Value in Every Community",
        primary="#374151", accent="#D97706", secondary="#6B7280", light_bg="#FFFBEB",
        palette=["#D97706", "#059669", "#EF4444", "#6366F1", "#0891B2", "#CA8A04"],
        ux_style=RETRO,
        content=_realestate_content(),
    )


def _creative_theme() -> TemplateTheme:
    from pptmaster.builder.ux_styles import MAGAZINE
    return TemplateTheme(
        key="creative", company_name="Prism Media Group", industry="Creative & Media",
        tagline="Where Storytelling Meets Strategy",
        primary="#18181B", accent="#BE185D", secondary="#71717A", light_bg="#FDF2F8",
        palette=["#BE185D", "#8B5CF6", "#2563EB", "#10B981", "#F59E0B", "#06B6D4"],
        ux_style=MAGAZINE,
        content=_creative_content(),
    )


# ── Content Generators ─────────────────────────────────────────────────

def _corporate_content(company: str) -> dict:
    return {
        "cover_title": "Presentation Title",
        "cover_subtitle": "Strategic Overview & Key Initiatives",
        "cover_date": "February 2026  |  Confidential",
        "toc_sections": [
            ("01", "About Us", "Company overview, values, and leadership"),
            ("02", "Strategy", "Executive summary, KPIs, and analysis"),
            ("03", "Process", "Workflows, diagrams, and planning"),
            ("04", "Data & Insights", "Charts, comparisons, and detailed analysis"),
            ("05", "Planning", "Milestones, kanban, and risk management"),
            ("06", "Deliverables", "Content layouts, quotes, and dashboards"),
            ("07", "Next Steps", "Action items, timelines, and closing"),
        ],
        "section_dividers": [
            ("01", "About Us", "Who we are and what we stand for"),
            ("02", "Strategy", "Our path to sustainable growth"),
            ("03", "Process", "How we plan and execute"),
            ("04", "Data & Insights", "Metrics that drive decisions"),
            ("05", "Planning", "Roadmap, milestones, and risk management"),
            ("06", "Deliverables", "Tangible outcomes and milestones"),
            ("07", "Next Steps", "Actions and accountability"),
        ],
        "overview_mission": (
            f"At {company}, we are committed to delivering exceptional value through "
            "innovation, integrity, and a relentless focus on our stakeholders' success.\n\n"
            "We believe in the power of collaboration and strategic thinking to drive sustainable growth."
        ),
        "overview_facts": [("Founded", "2005"), ("Employees", "2,500+"), ("Global Offices", "12"), ("Revenue", "$850M")],
        "values": [
            ("Integrity", "We act with honesty, transparency, and ethical leadership in every decision."),
            ("Innovation", "We embrace creative thinking and continuous improvement to stay ahead."),
            ("Excellence", "We pursue the highest standards in quality and performance."),
            ("Collaboration", "We achieve more together through trust, respect, and shared purpose."),
        ],
        "team": [
            ("Jane Smith", "Chief Executive Officer", "20+ years in executive leadership"),
            ("John Davis", "Chief Financial Officer", "Former VP at Fortune 100 firm"),
            ("Sarah Chen", "Chief Technology Officer", "Pioneer in AI/ML solutions"),
            ("Michael Brown", "Chief Operating Officer", "Operations excellence expert"),
        ],
        "key_facts": [
            ("$850M", "Annual Revenue"), ("2,500+", "Team Members"), ("98%", "Client Retention"),
            ("12", "Global Offices"), ("150+", "Enterprise Clients"), ("4.8/5", "Customer Rating"),
        ],
        "exec_bullets": [
            "Revenue grew 23% year-over-year, driven by new enterprise accounts and expanded service offerings across all major markets",
            "Successfully launched three new product lines, contributing $120M in incremental revenue during the first two quarters",
            "Customer retention rate improved to 98%, reflecting our commitment to excellence and client-centric approach",
            "Operational efficiency gains reduced costs by 15%, enabling reinvestment in R&D and talent acquisition",
            "Strategic partnerships with two Fortune 100 companies opened new distribution channels globally",
        ],
        "exec_metrics": [("$850M", "Revenue"), ("+23%", "YoY Growth"), ("98%", "Retention")],
        "kpis": [
            ("Revenue", "$850M", "+23%", 0.85, "\u2191"),
            ("Profit Margin", "18.5%", "+2.1%", 0.72, "\u2191"),
            ("Customer Churn", "2.1%", "-0.8%", 0.21, "\u2193"),
            ("NPS Score", "72", "+5pts", 0.72, "\u2191"),
        ],
        "process_steps": [
            ("Discovery", "Research & analysis"), ("Strategy", "Planning & design"),
            ("Develop", "Build & iterate"), ("Deploy", "Launch & integrate"), ("Optimize", "Measure & improve"),
        ],
        "cycle_phases": ["Plan", "Execute", "Review", "Improve"],
        "milestones": [
            ("Q1 2026", "Foundation", "Core platform launch\nand team expansion"),
            ("Q2 2026", "Growth", "Market entry into\n3 new regions"),
            ("Q3 2026", "Scale", "Enterprise features\nand partnerships"),
            ("Q4 2026", "Optimize", "Process refinement\nand cost reduction"),
            ("Q1 2027", "Expand", "International rollout\nand M&A targets"),
        ],
        "swot": {
            "strengths": ["Strong brand recognition", "Experienced leadership team", "Robust financial position"],
            "weaknesses": ["Limited geographic reach", "Legacy technology stack", "High employee turnover"],
            "opportunities": ["Emerging market expansion", "Strategic acquisitions", "Digital transformation demand"],
            "threats": ["Increasing competition", "Regulatory changes", "Economic uncertainty"],
        },
        "bar_title": "Revenue by Region",
        "bar_categories": ["North America", "Europe", "Asia Pacific", "Latin America", "Middle East", "Africa"],
        "bar_series": [
            {"name": "FY 2025", "values": [320, 210, 180, 95, 65, 45]},
            {"name": "FY 2026", "values": [380, 250, 220, 120, 85, 60]},
        ],
        "line_title": "Growth Trends",
        "line_categories": ["2022", "2023", "2024", "2025", "2026"],
        "line_series": [
            {"name": "Revenue ($M)", "values": [520, 610, 690, 780, 850]},
            {"name": "Profit ($M)", "values": [78, 95, 110, 135, 157]},
            {"name": "Headcount", "values": [1800, 2000, 2200, 2350, 2500]},
        ],
        "pie_title": "Revenue Distribution",
        "pie_categories": ["Enterprise", "Mid-Market", "SMB", "Government", "Partners"],
        "pie_values": [42, 28, 15, 10, 5],
        "pie_legend": ["Enterprise (42%)", "Mid-Market (28%)", "SMB (15%)", "Government (10%)", "Partners (5%)"],
        "comparison_headers": ("Option A", "Option B"),
        "comparison_rows": [
            ("Cost", "$500K/year", "$350K/year"), ("Implementation", "6 months", "4 months"),
            ("Scalability", "Enterprise-grade", "Mid-market focus"), ("Support", "24/7 dedicated", "Business hours"),
            ("Integration", "200+ connectors", "50+ connectors"), ("ROI Timeline", "12 months", "8 months"),
        ],
        "table_title": "Financial Summary",
        "table_headers": ["Metric", "FY 2024", "FY 2025", "FY 2026 (Proj)", "YoY Change"],
        "table_rows": [
            ["Revenue", "$690M", "$780M", "$850M", "+9.0%"],
            ["Gross Profit", "$380M", "$440M", "$490M", "+11.4%"],
            ["Operating Income", "$95M", "$120M", "$145M", "+20.8%"],
            ["Net Income", "$72M", "$92M", "$115M", "+25.0%"],
            ["EBITDA", "$130M", "$160M", "$195M", "+21.9%"],
            ["EPS", "$3.20", "$4.10", "$5.15", "+25.6%"],
        ],
        "table_col_widths": [2.0, 1.2, 1.2, 1.2, 1.0],
        "approach_intro": "We take a comprehensive, data-driven approach to solving complex business challenges. Our methodology is built on decades of industry experience.",
        "approach_bullets": [
            "Deep industry expertise across 12 vertical markets",
            "Proprietary analytics framework for rapid insights",
            "Agile delivery with bi-weekly stakeholder reviews",
            "Dedicated team of certified professionals",
            "Proven track record with 150+ enterprise clients",
        ],
        "col2": [
            {"heading": "Short-Term Goals", "bullets": [
                "Launch Phase 2 platform by Q2 2026", "Achieve 15% market share in target segments",
                "Reduce operational costs by 12%", "Complete digital transformation initiative",
            ]},
            {"heading": "Long-Term Vision", "bullets": [
                "Establish market leadership in 3 regions", "Build sustainable competitive moat",
                "Achieve $1B revenue milestone by 2028", "Develop AI-powered service offerings",
            ]},
        ],
        "pillars": [
            ("Consulting", "Strategic advisory services tailored to your industry and growth stage."),
            ("Technology", "Enterprise solutions built with modern architecture and best practices."),
            ("Analytics", "Data-driven insights that transform raw information into competitive advantage."),
        ],
        "quote_text": (
            "Innovation distinguishes between a leader and a follower. The companies that will thrive "
            "are those that embrace change, invest in their people, and never stop pushing the boundaries of what's possible."
        ),
        "quote_attribution": f"CEO, {company}",
        "quote_source": "Annual Shareholder Letter, 2025",
        "infographic_kpis": [("$850M", "Revenue"), ("2,500", "Employees"), ("98%", "Satisfaction")],
        "infographic_chart_title": "Quarterly Revenue",
        "infographic_chart_cats": ["Q1", "Q2", "Q3", "Q4"],
        "infographic_chart_series": [
            {"name": "2025", "values": [180, 200, 195, 210]},
            {"name": "2026", "values": [210, 230, 225, 250]},
        ],
        "infographic_progress": [
            ("Phase 1: Discovery", 1.0), ("Phase 2: Development", 0.75),
            ("Phase 3: Testing", 0.45), ("Phase 4: Deployment", 0.15),
        ],
        "next_steps": [
            ("Finalize Strategy", "Complete strategic plan review and board approval", "Executive Team", "Mar 2026"),
            ("Launch Phase 2", "Deploy next-gen platform to pilot customers", "Product & Engineering", "Apr 2026"),
            ("Expand Sales", "Hire regional sales directors and activate channels", "VP Sales", "May 2026"),
            ("Review & Iterate", "Quarterly business review and strategy refinement", "All Departments", "Jun 2026"),
        ],
        "cta_headline": "Let's Build the Future\nTogether",
        "cta_subtitle": "Ready to take the next step? We'd love to discuss how we can help accelerate your organization's growth and transformation.",
        "cta_contacts": [("Email", "contact@company.com"), ("Phone", "+1 (555) 123-4567"), ("Web", "www.company.com")],
        # ── New slide type defaults (s31-s40) ──────────────────────────
        "funnel_stages": [
            ("Awareness", "10,000", "Total market reach"),
            ("Interest", "5,200", "Engaged prospects"),
            ("Consideration", "2,800", "Qualified leads"),
            ("Intent", "1,400", "Sales pipeline"),
            ("Purchase", "680", "Converted customers"),
        ],
        "pyramid_layers": [
            ("Vision", "Long-term aspirational goal"),
            ("Strategy", "Multi-year plan to achieve vision"),
            ("Objectives", "Measurable annual targets"),
            ("Tactics", "Quarterly action plans"),
            ("Operations", "Daily execution and processes"),
        ],
        "venn_sets": [
            ("Innovation", "Cutting-edge technology and R&D"),
            ("Experience", "Deep industry expertise and talent"),
            ("Trust", "Proven track record with clients"),
        ],
        "venn_overlap": "Our Competitive Advantage",
        "hub_center": "Our Platform",
        "hub_spokes": [
            ("Analytics", "Real-time data insights"),
            ("Security", "Enterprise-grade protection"),
            ("Integration", "Seamless API connectivity"),
            ("Automation", "Workflow optimization"),
            ("Support", "24/7 expert assistance"),
            ("Scale", "Global infrastructure"),
        ],
        "milestone_items": [
            ("Jan 2026", "Project Kickoff", "Assemble team and define scope"),
            ("Mar 2026", "Alpha Release", "Core features complete"),
            ("May 2026", "Beta Testing", "User acceptance testing"),
            ("Jul 2026", "Launch", "Public release and marketing"),
            ("Sep 2026", "Scale", "Performance optimization"),
            ("Nov 2026", "Review", "Post-launch assessment"),
        ],
        "kanban_columns": [
            {"title": "To Do", "cards": ["Define requirements", "Design wireframes", "Set up CI/CD"]},
            {"title": "In Progress", "cards": ["API development", "Frontend build"]},
            {"title": "Done", "cards": ["Project charter", "Team onboarding", "Architecture review"]},
        ],
        "matrix_x_axis": "Impact",
        "matrix_y_axis": "Effort",
        "matrix_quadrants": [
            ("Quick Wins", "High impact, low effort — prioritize these"),
            ("Major Projects", "High impact, high effort — plan carefully"),
            ("Fill-Ins", "Low impact, low effort — delegate or automate"),
            ("Thankless Tasks", "Low impact, high effort — reconsider"),
        ],
        "gauges": [
            ("Revenue Target", "$8.2M / $10M", 0.82),
            ("Customer Satisfaction", "94%", 0.94),
            ("Sprint Velocity", "42 / 50 pts", 0.84),
            ("Uptime SLA", "99.95%", 0.999),
        ],
        "icon_grid_items": [
            ("chart", "Analytics", "Real-time data insights and reporting"),
            ("shield", "Security", "Enterprise-grade protection"),
            ("globe", "Global Reach", "Operations in 40+ countries"),
            ("lightning", "Performance", "Sub-50ms response times"),
            ("users", "Team", "2,500+ professionals worldwide"),
            ("trophy", "Awards", "Industry recognition and accolades"),
        ],
        "risk_x_label": "Likelihood",
        "risk_y_label": "Impact",
        "risk_items": [
            ("Data Breach", "critical", "Unauthorized access to sensitive data"),
            ("Supply Chain", "high", "Key vendor disruption risk"),
            ("Compliance", "medium", "Regulatory non-compliance"),
            ("Talent", "medium", "Key personnel retention"),
            ("Market Shift", "high", "Competitive landscape change"),
            ("Technology", "low", "Legacy system failure"),
        ],
        "thankyou_contacts": [
            ("Email", "contact@company.com", "\u2709"), ("Phone", "+1 (555) 123-4567", "\u260E"),
            ("Website", "www.company.com", "\u2302"), ("Location", "New York, NY", "\u2691"),
        ],
    }


def _healthcare_content() -> dict:
    c = _corporate_content("MedTech Solutions")
    c.update({
        "cover_title": "Advancing Patient Outcomes",
        "cover_subtitle": "Healthcare Innovation & Clinical Excellence",
        "toc_sections": [
            ("01", "Our Organization", "Mission, values, and clinical leadership"),
            ("02", "Clinical Strategy", "Patient outcomes, efficiency, and growth"),
            ("03", "Clinical Process", "Workflows and care delivery models"),
            ("04", "Performance Data", "Clinical metrics and financial analysis"),
            ("05", "Planning", "Milestones, projects, and risk assessment"),
            ("06", "Programs", "Service lines, research, and partnerships"),
            ("07", "Implementation", "Roadmap, actions, and next steps"),
        ],
        "section_dividers": [
            ("01", "Our Organization", "Caring for communities since 2005"),
            ("02", "Clinical Strategy", "Evidence-based paths to better outcomes"),
            ("03", "Clinical Process", "Workflows and care delivery models"),
            ("04", "Performance Data", "Metrics that guide clinical decisions"),
            ("05", "Planning", "Milestones, projects, and risk management"),
            ("06", "Programs", "Expanding access and quality of care"),
            ("07", "Implementation", "Turning strategy into patient impact"),
        ],
        "overview_mission": (
            "At MedTech Solutions, our mission is to improve patient outcomes through innovative "
            "healthcare technology and compassionate care delivery.\n\n"
            "We partner with leading health systems to transform clinical workflows and reduce costs."
        ),
        "overview_facts": [("Founded", "2008"), ("Clinicians", "3,200+"), ("Hospitals", "85+"), ("Patients/Year", "2.1M")],
        "values": [
            ("Patient First", "Every decision starts with what's best for the patient and their family."),
            ("Clinical Excellence", "We pursue the highest evidence-based standards in every interaction."),
            ("Compassion", "We treat every individual with dignity, empathy, and respect."),
            ("Innovation", "We harness technology to make healthcare more accessible and effective."),
        ],
        "team": [
            ("Dr. Sarah Mitchell", "Chief Medical Officer", "Board-certified, 25 years in clinical leadership"),
            ("James Rodriguez", "Chief Executive Officer", "Former COO of a top-10 health system"),
            ("Dr. Emily Park", "VP Clinical Research", "200+ peer-reviewed publications"),
            ("David Thompson", "Chief Nursing Officer", "Magnet designation champion"),
        ],
        "key_facts": [
            ("2.1M", "Patients Annually"), ("3,200+", "Clinical Staff"), ("98.5%", "Patient Satisfaction"),
            ("85+", "Partner Hospitals"), ("15%", "Readmission Reduction"), ("4.9/5", "Physician Rating"),
        ],
        "exec_bullets": [
            "Patient satisfaction scores increased to 98.5%, ranking in the top 5% nationally across all service lines",
            "Readmission rates decreased by 15% through our predictive analytics and care coordination programs",
            "Successfully onboarded 12 new hospital partners, expanding our clinical network to 85+ facilities",
            "Launched telehealth platform serving 450K virtual visits annually with 96% provider adoption",
            "Clinical research division published 45 peer-reviewed studies advancing treatment protocols",
        ],
        "exec_metrics": [("2.1M", "Patients"), ("-15%", "Readmissions"), ("98.5%", "Satisfaction")],
        "kpis": [
            ("Patient Volume", "2.1M", "+12%", 0.88, "\u2191"),
            ("Satisfaction", "98.5%", "+1.2%", 0.98, "\u2191"),
            ("Readmission Rate", "8.2%", "-15%", 0.18, "\u2193"),
            ("Bed Utilization", "91%", "+3%", 0.91, "\u2191"),
        ],
        "process_steps": [
            ("Assess", "Patient evaluation"), ("Diagnose", "Clinical analysis"),
            ("Plan", "Treatment protocol"), ("Treat", "Care delivery"), ("Monitor", "Outcomes tracking"),
        ],
        "cycle_phases": ["Assess", "Intervene", "Evaluate", "Adapt"],
        "milestones": [
            ("Q1 2026", "Telehealth 2.0", "Next-gen virtual care\nplatform launch"),
            ("Q2 2026", "AI Diagnostics", "ML-powered diagnostic\nassist rollout"),
            ("Q3 2026", "Network Growth", "Onboard 15 new\nhospital partners"),
            ("Q4 2026", "Accreditation", "Achieve JCI\ncertification"),
            ("Q1 2027", "Research Center", "Open dedicated\nclinical research hub"),
        ],
        "swot": {
            "strengths": ["Top-tier clinical outcomes", "Strong physician network", "Advanced EHR integration"],
            "weaknesses": ["Rural access gaps", "Nurse staffing challenges", "Aging infrastructure"],
            "opportunities": ["Telehealth expansion", "AI-assisted diagnostics", "Value-based care contracts"],
            "threats": ["Regulatory changes", "Cybersecurity risks", "Payer reimbursement cuts"],
        },
        "bar_title": "Patient Volume by Service Line",
        "bar_categories": ["Cardiology", "Oncology", "Orthopedics", "Neurology", "Pediatrics", "Emergency"],
        "bar_series": [
            {"name": "FY 2025", "values": [380, 290, 340, 220, 410, 520]},
            {"name": "FY 2026", "values": [420, 350, 380, 260, 450, 580]},
        ],
        "line_title": "Clinical Quality Trends",
        "line_categories": ["2022", "2023", "2024", "2025", "2026"],
        "line_series": [
            {"name": "Satisfaction %", "values": [94.2, 95.8, 96.9, 97.8, 98.5]},
            {"name": "Readmit Rate %", "values": [12.1, 11.2, 10.0, 9.1, 8.2]},
            {"name": "Mortality Idx", "values": [1.05, 0.98, 0.92, 0.88, 0.84]},
        ],
        "pie_title": "Revenue by Payer Mix",
        "pie_categories": ["Medicare", "Commercial", "Medicaid", "Self-Pay", "Other"],
        "pie_values": [38, 35, 15, 8, 4],
        "pie_legend": ["Medicare (38%)", "Commercial (35%)", "Medicaid (15%)", "Self-Pay (8%)", "Other (4%)"],
        "comparison_headers": ("In-House Platform", "Partner Solution"),
        "comparison_rows": [
            ("EHR Integration", "Native", "API-based"), ("Implementation", "12 months", "6 months"),
            ("Customization", "Full control", "Limited"), ("HIPAA Compliance", "Built-in", "Certified"),
            ("Support", "Internal team", "Vendor SLA"), ("Total Cost (3yr)", "$4.2M", "$2.8M"),
        ],
        "table_title": "Clinical Performance Dashboard",
        "table_headers": ["Metric", "FY 2024", "FY 2025", "FY 2026 (Proj)", "Trend"],
        "table_rows": [
            ["Patient Volume", "1.8M", "1.9M", "2.1M", "+10.5%"],
            ["Avg Length of Stay", "4.8 days", "4.5 days", "4.2 days", "-6.7%"],
            ["Readmission Rate", "10.0%", "9.1%", "8.2%", "-9.9%"],
            ["OR Utilization", "78%", "82%", "86%", "+4.9%"],
            ["Revenue per Bed", "$1.2M", "$1.35M", "$1.5M", "+11.1%"],
            ["Staff Satisfaction", "82%", "86%", "89%", "+3.5%"],
        ],
        "table_col_widths": [2.0, 1.2, 1.2, 1.2, 1.0],
        "approach_intro": "Our clinical methodology combines evidence-based medicine with cutting-edge technology to deliver superior patient outcomes across all service lines.",
        "approach_bullets": [
            "Evidence-based clinical protocols reviewed quarterly",
            "AI-powered early warning system for patient deterioration",
            "Interdisciplinary care teams for complex cases",
            "Patient engagement platform with 85% adoption",
            "Continuous quality improvement using Lean Six Sigma",
        ],
        "col2": [
            {"heading": "Clinical Priorities", "bullets": [
                "Reduce hospital-acquired infections by 25%", "Achieve top-decile patient satisfaction",
                "Implement AI-assisted diagnosis in radiology", "Launch chronic disease management program",
            ]},
            {"heading": "Growth Strategy", "bullets": [
                "Expand telehealth to 30 new markets", "Open 3 ambulatory surgery centers",
                "Develop specialty centers of excellence", "Partner with 2 academic medical centers",
            ]},
        ],
        "pillars": [
            ("Clinical Care", "Patient-centered care delivery with measurable quality outcomes."),
            ("Digital Health", "Technology platforms that connect patients, providers, and data seamlessly."),
            ("Research", "Advancing medical knowledge through clinical trials and applied research."),
        ],
        "quote_text": (
            "The future of healthcare lies at the intersection of compassion and technology. "
            "By empowering clinicians with the right tools, we don't just treat illness \u2014 we transform lives."
        ),
        "quote_attribution": "Dr. Sarah Mitchell, CMO",
        "quote_source": "Annual Clinical Excellence Report, 2025",
        "infographic_kpis": [("2.1M", "Patients"), ("85+", "Hospitals"), ("98.5%", "Satisfaction")],
        "next_steps": [
            ("Launch Telehealth 2.0", "Deploy next-gen virtual care platform across all service lines", "VP Digital Health", "Mar 2026"),
            ("AI Diagnostic Pilot", "Roll out ML-assisted radiology reading at 5 pilot sites", "Clinical Informatics", "Apr 2026"),
            ("Staffing Initiative", "Recruit 200 nurses through new residency partnerships", "Chief Nursing Officer", "May 2026"),
            ("Quality Review", "Complete annual clinical quality audit and benchmarking", "Quality Committee", "Jun 2026"),
        ],
        "cta_headline": "Partner With Us to\nTransform Patient Care",
        "cta_subtitle": "Let's discuss how our clinical platform and expertise can help your health system achieve better outcomes.",
        "cta_contacts": [("Email", "partnerships@medtech.com"), ("Phone", "+1 (555) 234-5678"), ("Web", "www.medtechsolutions.com")],
    })
    return c


def _technology_content() -> dict:
    c = _corporate_content("NexTech Systems")
    c.update({
        "cover_title": "Engineering the Future",
        "cover_subtitle": "Platform Strategy & Technical Roadmap",
        "overview_mission": (
            "NexTech Systems builds enterprise-grade software that scales. Our platform processes "
            "10B+ API calls monthly with 99.99% uptime.\n\n"
            "We empower engineering teams to ship faster with less complexity."
        ),
        "overview_facts": [("Founded", "2012"), ("Engineers", "1,800+"), ("API Calls/Mo", "10B+"), ("ARR", "$420M")],
        "values": [
            ("Ship Fast", "We bias toward action and iterate rapidly based on real user feedback."),
            ("Build Right", "We invest in architecture, testing, and reliability from day one."),
            ("Think Big", "We tackle hard problems that create outsized impact for our customers."),
            ("Stay Curious", "We foster continuous learning and embrace emerging technologies."),
        ],
        "team": [
            ("Alex Rivera", "CEO & Co-Founder", "Ex-Google Staff Engineer, systems architecture"),
            ("Priya Patel", "CTO", "Built infrastructure at 3 unicorn startups"),
            ("Marcus Kim", "VP Engineering", "Led teams of 500+ across 4 time zones"),
            ("Lisa Chang", "Chief Product Officer", "20 years in enterprise SaaS product"),
        ],
        "key_facts": [
            ("$420M", "Annual Recurring Revenue"), ("1,800+", "Engineers"), ("99.99%", "Platform Uptime"),
            ("10B+", "API Calls Monthly"), ("2,200+", "Enterprise Customers"), ("48ms", "Avg Latency"),
        ],
        "exec_bullets": [
            "ARR grew 45% to $420M driven by enterprise expansion and new platform capabilities",
            "Platform reliability maintained at 99.99% while processing 10B+ monthly API calls",
            "Average API latency reduced from 72ms to 48ms through edge computing deployment",
            "Developer adoption increased 60% following launch of self-service SDK and documentation",
            "SOC 2 Type II and ISO 27001 certifications achieved ahead of schedule",
        ],
        "exec_metrics": [("$420M", "ARR"), ("+45%", "Growth"), ("99.99%", "Uptime")],
        "kpis": [
            ("ARR", "$420M", "+45%", 0.90, "\u2191"),
            ("Uptime", "99.99%", "+0.01%", 0.99, "\u2191"),
            ("Latency", "48ms", "-33%", 0.48, "\u2193"),
            ("NRR", "135%", "+8pts", 0.85, "\u2191"),
        ],
        "process_steps": [
            ("Discover", "Requirements & design"), ("Architect", "System design"),
            ("Build", "Sprint development"), ("Test", "QA & security"), ("Ship", "Deploy & monitor"),
        ],
        "cycle_phases": ["Design", "Build", "Test", "Deploy"],
        "swot": {
            "strengths": ["99.99% platform reliability", "Best-in-class API latency", "Strong developer community"],
            "weaknesses": ["Complex onboarding flow", "Limited mobile SDK", "High cloud costs"],
            "opportunities": ["AI/ML platform features", "Edge computing expansion", "Vertical SaaS plays"],
            "threats": ["Open-source alternatives", "Cloud vendor competition", "Talent market pressure"],
        },
        "bar_title": "Revenue by Product Line",
        "bar_categories": ["Platform Core", "Analytics", "Security", "Integration", "AI/ML", "Support"],
        "bar_series": [
            {"name": "FY 2025", "values": [150, 85, 60, 45, 30, 20]},
            {"name": "FY 2026", "values": [195, 110, 80, 60, 55, 25]},
        ],
        "line_title": "Platform Growth Metrics",
        "line_categories": ["2022", "2023", "2024", "2025", "2026"],
        "line_series": [
            {"name": "ARR ($M)", "values": [120, 180, 260, 340, 420]},
            {"name": "API Calls (B)", "values": [2.1, 3.8, 6.2, 8.5, 10.2]},
            {"name": "Customers", "values": [800, 1100, 1500, 1900, 2200]},
        ],
        "pie_title": "Customer Segment Distribution",
        "pie_categories": ["Enterprise", "Mid-Market", "Startup", "Government", "Education"],
        "pie_values": [45, 30, 12, 8, 5],
        "pie_legend": ["Enterprise (45%)", "Mid-Market (30%)", "Startup (12%)", "Government (8%)", "Education (5%)"],
        "table_title": "Platform Performance Metrics",
        "table_headers": ["Metric", "Q1 2025", "Q2 2025", "Q3 2025", "Q4 2025"],
        "table_rows": [
            ["API Calls (B)", "8.2", "8.8", "9.5", "10.2"],
            ["P99 Latency (ms)", "52", "50", "49", "48"],
            ["Error Rate (%)", "0.012", "0.010", "0.009", "0.008"],
            ["New Customers", "125", "140", "155", "170"],
            ["Deployments/Day", "45", "52", "58", "65"],
            ["Incidents (P1)", "2", "1", "1", "0"],
        ],
        "pillars": [
            ("Platform", "Scalable infrastructure handling 10B+ requests with sub-50ms latency."),
            ("Developer Tools", "SDK, CLI, and documentation that developers actually love to use."),
            ("Intelligence", "AI-powered analytics turning platform data into actionable insights."),
        ],
        "quote_text": (
            "The best infrastructure is invisible. When engineers can focus on building products instead of "
            "fighting their tools, that's when real innovation happens."
        ),
        "quote_attribution": "Alex Rivera, CEO & Co-Founder",
        "quote_source": "NexTech Developer Conference Keynote, 2025",
        "cta_headline": "Build Something\nExtraordinary",
        "cta_subtitle": "See how NexTech's platform can accelerate your engineering team's velocity and reliability.",
    })
    return c


def _finance_content() -> dict:
    c = _corporate_content("Meridian Capital")
    c.update({
        "cover_title": "Wealth Through Vision",
        "cover_subtitle": "Investment Strategy & Portfolio Performance",
        "overview_mission": (
            "Meridian Capital delivers superior risk-adjusted returns through disciplined investment strategies "
            "and deep market expertise.\n\nWith $28B in assets under management, we serve institutional investors and high-net-worth families."
        ),
        "overview_facts": [("Founded", "1998"), ("AUM", "$28B"), ("Professionals", "450+"), ("Offices", "8 Global")],
        "values": [
            ("Fiduciary Duty", "Our clients' interests always come first in every decision we make."),
            ("Discipline", "We follow proven investment processes and avoid emotional reactions."),
            ("Transparency", "We communicate openly about performance, risks, and fees."),
            ("Long-Term View", "We build portfolios designed to compound wealth over decades."),
        ],
        "team": [
            ("Robert Chen", "Managing Partner", "30 years in institutional asset management"),
            ("Victoria Hughes", "Chief Investment Officer", "Ex-Goldman Sachs portfolio strategist"),
            ("Andrew Walsh", "Head of Fixed Income", "Built $12B bond portfolio franchise"),
            ("Maria Santos", "Chief Risk Officer", "Quant risk specialist, MIT PhD"),
        ],
        "key_facts": [
            ("$28B", "Assets Under Management"), ("450+", "Investment Professionals"), ("12.8%", "10-Year CAGR"),
            ("8", "Global Offices"), ("320+", "Institutional Clients"), ("Top 5%", "Peer Ranking"),
        ],
        "exec_bullets": [
            "AUM grew 18% to $28B driven by strong performance and $3.2B in net new client inflows",
            "Flagship equity fund returned 16.4%, outperforming the benchmark by 380 basis points",
            "Fixed income portfolio generated 7.2% return while maintaining investment-grade average quality",
            "Successfully launched ESG-focused fund attracting $1.8B in commitments within first year",
            "Risk management framework enhanced with AI-powered stress testing across all strategies",
        ],
        "exec_metrics": [("$28B", "AUM"), ("+16.4%", "Equity Return"), ("Top 5%", "Peer Rank")],
        "kpis": [
            ("AUM", "$28B", "+18%", 0.88, "\u2191"),
            ("Returns", "16.4%", "+380bps", 0.82, "\u2191"),
            ("Sharpe Ratio", "1.42", "+0.15", 0.71, "\u2191"),
            ("Client Retention", "97%", "+1%", 0.97, "\u2191"),
        ],
        "process_steps": [
            ("Research", "Macro & sector analysis"), ("Screen", "Opportunity filtering"),
            ("Analyze", "Deep due diligence"), ("Execute", "Position management"), ("Monitor", "Risk oversight"),
        ],
        "swot": {
            "strengths": ["Top-decile performance track record", "Deep institutional relationships", "Proprietary quant models"],
            "weaknesses": ["Limited retail distribution", "Concentrated in North America", "Key person dependencies"],
            "opportunities": ["ESG/impact investing demand", "Private credit expansion", "Asian market entry"],
            "threats": ["Fee compression", "Passive index competition", "Regulatory capital requirements"],
        },
        "bar_title": "AUM by Asset Class ($B)",
        "bar_categories": ["US Equity", "Intl Equity", "Fixed Income", "Private Credit", "Real Assets", "Alternatives"],
        "bar_series": [
            {"name": "FY 2025", "values": [8.5, 4.2, 5.8, 2.1, 1.8, 1.3]},
            {"name": "FY 2026", "values": [10.2, 5.0, 6.5, 2.8, 2.0, 1.5]},
        ],
        "line_title": "Portfolio Performance vs Benchmark",
        "line_categories": ["2022", "2023", "2024", "2025", "2026"],
        "line_series": [
            {"name": "Meridian Fund", "values": [8.2, 12.5, 14.8, 16.4, 15.2]},
            {"name": "S&P 500", "values": [7.1, 10.8, 12.2, 12.6, 13.0]},
            {"name": "Peer Median", "values": [6.8, 10.2, 11.5, 13.1, 12.5]},
        ],
        "pie_title": "Client Type Distribution",
        "pie_categories": ["Pension Funds", "Endowments", "Family Offices", "Sovereign Wealth", "Corporates"],
        "pie_values": [35, 25, 20, 12, 8],
        "pie_legend": ["Pension Funds (35%)", "Endowments (25%)", "Family Offices (20%)", "Sovereign (12%)", "Corporates (8%)"],
        "table_title": "Strategy Performance Summary",
        "table_headers": ["Strategy", "1-Year", "3-Year", "5-Year", "Since Inception"],
        "table_rows": [
            ["Core Equity", "+16.4%", "+14.2%", "+12.8%", "+11.5%"],
            ["Growth Equity", "+22.1%", "+18.5%", "+15.3%", "+13.8%"],
            ["Fixed Income", "+7.2%", "+5.8%", "+4.9%", "+5.2%"],
            ["Private Credit", "+11.5%", "+10.2%", "+9.8%", "+9.5%"],
            ["Real Assets", "+8.8%", "+7.5%", "+7.1%", "+6.9%"],
            ["Multi-Asset", "+12.3%", "+10.8%", "+9.5%", "+8.8%"],
        ],
        "pillars": [
            ("Equity", "Active management with a focus on quality companies and sustainable growth."),
            ("Fixed Income", "Rigorous credit analysis delivering consistent income with capital preservation."),
            ("Alternatives", "Diversified strategies providing uncorrelated returns and downside protection."),
        ],
        "quote_text": (
            "Wealth is not built through luck but through discipline, patience, and a rigorous commitment to "
            "understanding what drives long-term value creation."
        ),
        "quote_attribution": "Robert Chen, Managing Partner",
        "quote_source": "Investor Annual Meeting, 2025",
        "cta_headline": "Invest With\nConfidence",
        "cta_subtitle": "Schedule a consultation to learn how Meridian Capital can help achieve your investment objectives.",
    })
    return c


def _education_content() -> dict:
    c = _corporate_content("Horizon University")
    c.update({
        "cover_title": "Shaping Tomorrow's Leaders",
        "cover_subtitle": "Academic Excellence & Institutional Strategy",
        "overview_mission": (
            "Horizon University is dedicated to transforming lives through accessible, world-class education "
            "and groundbreaking research.\n\nWith 45,000 students across 12 colleges, we prepare leaders for a complex global landscape."
        ),
        "overview_facts": [("Founded", "1892"), ("Students", "45,000+"), ("Faculty", "2,800"), ("Endowment", "$4.2B")],
        "values": [
            ("Academic Freedom", "We protect the pursuit of knowledge and open intellectual inquiry."),
            ("Inclusion", "We celebrate diversity and ensure every student can thrive and belong."),
            ("Impact", "We apply research and teaching to solve the world's pressing challenges."),
            ("Stewardship", "We responsibly manage resources for future generations of scholars."),
        ],
        "team": [
            ("Dr. Margaret Liu", "President", "Former provost at a top-20 research university"),
            ("Dr. James Whitfield", "Provost & VP, Academics", "Pioneer in interdisciplinary curricula"),
            ("Catherine Okonkwo", "VP Student Affairs", "National leader in student success initiatives"),
            ("Richard Gomez", "CFO & VP Finance", "20 years in higher education finance"),
        ],
        "key_facts": [
            ("45,000+", "Total Enrollment"), ("2,800", "Faculty Members"), ("94%", "Graduation Rate"),
            ("$4.2B", "Endowment"), ("R1", "Research Classification"), ("Top 30", "National Ranking"),
        ],
        "exec_bullets": [
            "Enrollment grew 8% with record-breaking diversity \u2014 42% students of color and 15% international",
            "Graduation rate improved to 94%, driven by our student success coaching program",
            "Research funding increased 22% to $680M, with 3 new interdisciplinary research centers launched",
            "Endowment returned 14.2%, growing to $4.2B and supporting 35% of financial aid",
            "Launched 12 new degree programs including AI Ethics and Climate Science",
        ],
        "exec_metrics": [("45K+", "Students"), ("94%", "Grad Rate"), ("$680M", "Research $")],
        "kpis": [
            ("Enrollment", "45,200", "+8%", 0.90, "\u2191"),
            ("Graduation Rate", "94%", "+2%", 0.94, "\u2191"),
            ("Research Funding", "$680M", "+22%", 0.85, "\u2191"),
            ("Donor Giving", "$185M", "+15%", 0.78, "\u2191"),
        ],
        "swot": {
            "strengths": ["R1 research classification", "Strong endowment", "Growing global reputation"],
            "weaknesses": ["Aging campus facilities", "Adjunct faculty reliance", "Student debt concerns"],
            "opportunities": ["Online degree expansion", "Corporate partnerships", "International campuses"],
            "threats": ["Declining demographics", "State funding cuts", "Credential competition"],
        },
        "bar_title": "Enrollment by College",
        "bar_categories": ["Engineering", "Business", "Arts & Sciences", "Health", "Education", "Law"],
        "bar_series": [
            {"name": "2024-25", "values": [8200, 7500, 9800, 6200, 4500, 2800]},
            {"name": "2025-26", "values": [9000, 8100, 10200, 6800, 4800, 3000]},
        ],
        "line_title": "Institutional Growth Indicators",
        "line_categories": ["2021", "2022", "2023", "2024", "2025"],
        "line_series": [
            {"name": "Enrollment (K)", "values": [38.5, 40.2, 41.8, 43.5, 45.2]},
            {"name": "Research ($M)", "values": [480, 520, 560, 620, 680]},
            {"name": "Endowment ($B)", "values": [3.2, 3.4, 3.6, 3.9, 4.2]},
        ],
        "pillars": [
            ("Teaching", "Innovative pedagogy that prepares students for careers that don't yet exist."),
            ("Research", "Pushing the boundaries of human knowledge across every discipline."),
            ("Service", "Engaging with communities to apply academic insights to real-world challenges."),
        ],
        "quote_text": (
            "Education is not merely the transmission of knowledge \u2014 it is the cultivation of minds capable of "
            "reimagining the world and having the courage to build it."
        ),
        "quote_attribution": "Dr. Margaret Liu, President",
        "quote_source": "Inaugural Address, 2024",
        "cta_headline": "Invest in the\nFuture of Education",
        "cta_subtitle": "Join us as we build a university that transforms students, advances knowledge, and serves society.",
    })
    return c


def _sustainability_content() -> dict:
    c = _corporate_content("EcoForward Group")
    c.update({
        "cover_title": "Driving Sustainable Impact",
        "cover_subtitle": "ESG Strategy & Environmental Performance",
        "overview_mission": (
            "EcoForward Group helps organizations achieve net-zero goals through measurable sustainability programs "
            "and responsible supply chain transformation.\n\nWe believe profitability and planet stewardship are not mutually exclusive."
        ),
        "overview_facts": [("Founded", "2015"), ("Clients", "800+"), ("CO\u2082 Offset", "2.4M tons"), ("Team", "650+")],
        "values": [
            ("Planet First", "We measure every decision against its environmental impact."),
            ("Accountability", "We set bold targets and report transparently on our progress."),
            ("Equity", "We ensure green transitions benefit all communities, especially the vulnerable."),
            ("Science-Led", "We follow peer-reviewed data, not trends or greenwashing."),
        ],
        "key_facts": [
            ("2.4M", "Tons CO\u2082 Offset"), ("800+", "Client Organizations"), ("42%", "Avg Emissions Reduction"),
            ("18", "Countries Active"), ("$320M", "Green Investments"), ("A+", "ESG Rating"),
        ],
        "exec_metrics": [("2.4M", "Tons CO\u2082"), ("-42%", "Emissions"), ("A+", "ESG Rating")],
        "kpis": [
            ("CO\u2082 Reduced", "2.4Mt", "+35%", 0.85, "\u2191"),
            ("Clients", "800+", "+28%", 0.80, "\u2191"),
            ("Renewable %", "72%", "+12%", 0.72, "\u2191"),
            ("ESG Score", "A+", "Stable", 0.95, "\u2191"),
        ],
        "swot": {
            "strengths": ["Science-based methodology", "Strong regulatory expertise", "Verified carbon credits"],
            "weaknesses": ["Scaling measurement technology", "Emerging market presence", "Talent pipeline"],
            "opportunities": ["Mandatory ESG reporting", "Carbon market growth", "Green bonds demand"],
            "threats": ["Greenwashing backlash", "Policy reversals", "Carbon credit integrity concerns"],
        },
        "pillars": [
            ("Advisory", "Strategic ESG roadmaps aligned with SBTi and TCFD frameworks."),
            ("Measurement", "Proprietary carbon accounting across Scope 1, 2, and 3 emissions."),
            ("Offsets", "Verified, high-quality carbon credit programs with real community impact."),
        ],
        "quote_text": (
            "Sustainability is not a cost center \u2014 it is the most important investment a company can make "
            "in its own future. The data is clear: green companies outperform."
        ),
        "quote_attribution": "CEO, EcoForward Group",
        "quote_source": "UN Climate Action Summit, 2025",
        "cta_headline": "Act Now for a\nSustainable Tomorrow",
        "cta_subtitle": "Partner with EcoForward to build a credible, measurable path to net-zero and ESG excellence.",
    })
    return c


def _luxury_content() -> dict:
    c = _corporate_content("Maison Luxe")
    c.update({
        "cover_title": "The Art of Excellence",
        "cover_subtitle": "Brand Strategy & Retail Performance",
        "overview_mission": (
            "Maison Luxe curates extraordinary experiences through heritage craftsmanship, visionary design, "
            "and an unwavering commitment to quality.\n\nOur portfolio of iconic brands defines modern luxury across 40+ countries."
        ),
        "overview_facts": [("Founded", "1987"), ("Brands", "12"), ("Boutiques", "280+"), ("Revenue", "\u20AC3.8B")],
        "values": [
            ("Heritage", "We honor the traditions and artisanship passed down through generations."),
            ("Exclusivity", "We create desire through rarity, quality, and impeccable presentation."),
            ("Artistry", "Every product is a canvas for creative expression and meticulous detail."),
            ("Experience", "We orchestrate moments that transcend the ordinary at every touchpoint."),
        ],
        "key_facts": [
            ("\u20AC3.8B", "Annual Revenue"), ("12", "Luxury Brands"), ("280+", "Global Boutiques"),
            ("40+", "Countries"), ("92%", "Brand Desirability"), ("18M+", "Social Followers"),
        ],
        "exec_metrics": [("\u20AC3.8B", "Revenue"), ("+14%", "Growth"), ("92%", "Desirability")],
        "kpis": [
            ("Revenue", "\u20AC3.8B", "+14%", 0.88, "\u2191"),
            ("Same-Store Sales", "+9.2%", "+3.1%", 0.72, "\u2191"),
            ("Digital Revenue", "28%", "+5pts", 0.65, "\u2191"),
            ("Brand Index", "92", "+3pts", 0.92, "\u2191"),
        ],
        "swot": {
            "strengths": ["Heritage brand equity", "Global boutique network", "Exclusive artisan supply chain"],
            "weaknesses": ["E-commerce lagging competitors", "Limited Gen Z engagement", "High fixed costs"],
            "opportunities": ["China market rebound", "Digital collectibles/NFTs", "Sustainable luxury positioning"],
            "threats": ["Counterfeit market growth", "Luxury fatigue post-pandemic", "Geopolitical travel disruptions"],
        },
        "pillars": [
            ("Haute Couture", "Bespoke creations that define the pinnacle of fashion and personal expression."),
            ("Accessories", "Iconic handbags, timepieces, and jewelry that become generational heirlooms."),
            ("Experiences", "Exclusive events, private shopping, and hospitality that create lasting memories."),
        ],
        "quote_text": (
            "True luxury is not about price \u2014 it is about the emotion, the story, and the extraordinary "
            "care invested in every stitch, every stone, every moment."
        ),
        "quote_attribution": "Creative Director, Maison Luxe",
        "quote_source": "Paris Fashion Week Opening, 2025",
        "cta_headline": "Experience\nExtraordinary",
        "cta_subtitle": "Discover partnership opportunities with one of the world's most prestigious luxury houses.",
    })
    return c


def _startup_content() -> dict:
    c = _corporate_content("Velocity Ventures")
    c.update({
        "cover_title": "Accelerating Growth",
        "cover_subtitle": "Series B Pitch \u2014 Investor Presentation",
        "overview_mission": (
            "Velocity Ventures is the AI-powered growth platform that helps SaaS companies scale from $1M to $100M ARR. "
            "We automate go-to-market, reduce churn, and unlock expansion revenue.\n\nBacked by tier-1 VCs with $85M raised."
        ),
        "overview_facts": [("Founded", "2021"), ("ARR", "$32M"), ("Customers", "450+"), ("Raised", "$85M")],
        "values": [
            ("Move Fast", "We ship weekly and learn daily. Speed is our competitive advantage."),
            ("Customer Obsessed", "We earn trust by solving real problems, not building cool features."),
            ("Think 10x", "We aim for order-of-magnitude improvements, not incremental gains."),
            ("Own It", "Everyone is an owner. We take initiative and accountability."),
        ],
        "key_facts": [
            ("$32M", "ARR (3x YoY)"), ("450+", "SaaS Customers"), ("155%", "Net Revenue Retention"),
            ("$85M", "Total Funding"), ("98%", "Gross Margin"), ("18mo", "Avg Payback Period"),
        ],
        "exec_metrics": [("$32M", "ARR"), ("3x", "YoY Growth"), ("155%", "NRR")],
        "kpis": [
            ("ARR", "$32M", "+200%", 0.85, "\u2191"),
            ("NRR", "155%", "+15pts", 0.78, "\u2191"),
            ("Burn Multiple", "1.2x", "-0.5x", 0.40, "\u2193"),
            ("LTV:CAC", "5.2x", "+1.8x", 0.82, "\u2191"),
        ],
        "swot": {
            "strengths": ["3x growth rate", "AI-native architecture", "Best NRR in category"],
            "weaknesses": ["Limited brand awareness", "Small sales team", "Single product line"],
            "opportunities": ["$50B TAM growing 25%/yr", "Enterprise expansion", "International markets"],
            "threats": ["Well-funded competitors", "Market consolidation", "AI commoditization"],
        },
        "pillars": [
            ("Growth Engine", "AI-powered lead scoring and automated outbound that 3x pipeline."),
            ("Retention AI", "Predictive churn models that identify at-risk accounts 60 days early."),
            ("Revenue Intel", "Expansion revenue insights that turn customers into advocates."),
        ],
        "quote_text": (
            "We're not building another SaaS tool. We're building the operating system for growth. "
            "Every SaaS company will need this \u2014 the question is when, not if."
        ),
        "quote_attribution": "CEO & Co-Founder, Velocity Ventures",
        "quote_source": "Series B Investor Letter, 2025",
        "cta_headline": "Join the\nGrowth Revolution",
        "cta_subtitle": "We're raising $60M Series C to expand into enterprise and international markets. Let's talk.",
    })
    return c


def _government_content() -> dict:
    c = _corporate_content("National Infrastructure Agency")
    c.update({
        "cover_title": "Serving the Public Interest",
        "cover_subtitle": "Annual Performance Report & Strategic Plan",
        "overview_mission": (
            "The National Infrastructure Agency is responsible for planning, building, and maintaining critical "
            "public infrastructure that serves 120 million citizens.\n\nWe are committed to transparency, efficiency, and equitable service delivery."
        ),
        "overview_facts": [("Established", "1962"), ("Employees", "42,000"), ("Annual Budget", "$18.5B"), ("Projects", "2,400+")],
        "values": [
            ("Public Trust", "We earn confidence through transparent operations and accountable leadership."),
            ("Equity", "We ensure infrastructure investments serve all communities fairly."),
            ("Safety", "We maintain the highest safety standards to protect workers and the public."),
            ("Efficiency", "We maximize the impact of every taxpayer dollar invested."),
        ],
        "key_facts": [
            ("$18.5B", "Annual Budget"), ("42,000", "Federal Employees"), ("2,400+", "Active Projects"),
            ("120M", "Citizens Served"), ("94%", "Project On-Time Rate"), ("A+", "Audit Rating"),
        ],
        "exec_metrics": [("$18.5B", "Budget"), ("94%", "On-Time"), ("2,400+", "Projects")],
        "kpis": [
            ("Budget Execution", "97%", "+2%", 0.97, "\u2191"),
            ("On-Time Delivery", "94%", "+5%", 0.94, "\u2191"),
            ("Cost Efficiency", "1.08x", "-0.12x", 0.54, "\u2193"),
            ("Public Satisfaction", "78%", "+4%", 0.78, "\u2191"),
        ],
        "swot": {
            "strengths": ["Stable federal funding", "Deep engineering expertise", "Nationwide presence"],
            "weaknesses": ["Bureaucratic procurement", "IT system modernization", "Workforce retirement wave"],
            "opportunities": ["Infrastructure bill funding", "Smart city technology", "Public-private partnerships"],
            "threats": ["Political budget uncertainty", "Climate change impacts", "Cybersecurity threats"],
        },
        "pillars": [
            ("Transportation", "Roads, bridges, rail, and ports that keep the nation's economy moving."),
            ("Water Systems", "Clean water delivery and flood protection for communities nationwide."),
            ("Digital", "Broadband expansion and smart infrastructure connecting rural and urban America."),
        ],
        "quote_text": (
            "Public infrastructure is the foundation of national prosperity. Every bridge, every mile of broadband, "
            "every water treatment plant is an investment in our shared future."
        ),
        "quote_attribution": "Agency Director",
        "quote_source": "Congressional Testimony, 2025",
        "cta_headline": "Building America's\nFuture Together",
        "cta_subtitle": "Learn about partnership opportunities, grant programs, and public comment periods.",
    })
    return c


def _realestate_content() -> dict:
    c = _corporate_content("Pinnacle Properties")
    c.update({
        "cover_title": "Building Lasting Value",
        "cover_subtitle": "Portfolio Strategy & Market Outlook",
        "overview_mission": (
            "Pinnacle Properties acquires, develops, and manages premium commercial and residential assets "
            "across major metropolitan markets.\n\nOur disciplined approach has delivered consistent returns for investors over two decades."
        ),
        "overview_facts": [("Founded", "2003"), ("Portfolio", "$6.2B"), ("Properties", "185+"), ("Sq Ft", "42M")],
        "values": [
            ("Location", "We invest where demand is structural, not speculative."),
            ("Quality", "We build and maintain assets to the highest standards of design and function."),
            ("Community", "We create spaces that strengthen neighborhoods and local economies."),
            ("Returns", "We deliver consistent, risk-adjusted returns through disciplined underwriting."),
        ],
        "key_facts": [
            ("$6.2B", "Portfolio Value"), ("185+", "Properties"), ("42M", "Total Sq Ft"),
            ("95.8%", "Occupancy Rate"), ("7.2%", "Average Cap Rate"), ("$380M", "Annual NOI"),
        ],
        "exec_metrics": [("$6.2B", "Portfolio"), ("95.8%", "Occupancy"), ("$380M", "NOI")],
        "kpis": [
            ("Portfolio Value", "$6.2B", "+12%", 0.85, "\u2191"),
            ("Occupancy", "95.8%", "+1.2%", 0.96, "\u2191"),
            ("NOI", "$380M", "+8%", 0.82, "\u2191"),
            ("IRR", "14.5%", "+1.5%", 0.72, "\u2191"),
        ],
        "swot": {
            "strengths": ["Prime location portfolio", "Strong tenant relationships", "In-house management"],
            "weaknesses": ["Office sector exposure", "Geographic concentration", "High leverage ratio"],
            "opportunities": ["Mixed-use redevelopment", "Life sciences facilities", "Sun Belt migration"],
            "threats": ["Rising interest rates", "Remote work impact", "Construction cost inflation"],
        },
        "pillars": [
            ("Commercial", "Class A office, retail, and industrial assets in top-tier markets."),
            ("Residential", "Luxury multifamily and build-to-rent communities in high-growth metros."),
            ("Development", "Ground-up and repositioning projects that create transformative value."),
        ],
        "quote_text": (
            "Real estate is more than bricks and mortar \u2014 it's about creating places where businesses thrive, "
            "communities flourish, and investors earn enduring returns."
        ),
        "quote_attribution": "CEO, Pinnacle Properties",
        "quote_source": "Investor Annual Report, 2025",
        "cta_headline": "Invest in\nPremium Real Estate",
        "cta_subtitle": "Explore co-investment opportunities in our latest fund and development pipeline.",
    })
    return c


def _creative_content() -> dict:
    c = _corporate_content("Prism Media Group")
    c.update({
        "cover_title": "Stories That Move Markets",
        "cover_subtitle": "Creative Strategy & Brand Performance",
        "overview_mission": (
            "Prism Media Group is an award-winning creative agency that builds brands people love. "
            "We combine data-driven strategy with world-class creative execution.\n\n"
            "Our campaigns have generated $2.8B in client revenue and won 150+ industry awards."
        ),
        "overview_facts": [("Founded", "2010"), ("Clients", "200+"), ("Awards", "150+"), ("Reach", "500M+")],
        "values": [
            ("Bold Ideas", "We push creative boundaries to break through the noise."),
            ("Data-Driven", "Every campaign is grounded in audience insights and performance data."),
            ("Authentic", "We tell real stories that create genuine connections with audiences."),
            ("Results", "We measure everything and optimize relentlessly for client outcomes."),
        ],
        "key_facts": [
            ("$2.8B", "Client Revenue Generated"), ("200+", "Brand Partners"), ("500M+", "Monthly Audience Reach"),
            ("150+", "Industry Awards"), ("3.2x", "Avg Campaign ROAS"), ("92%", "Client Retention"),
        ],
        "exec_metrics": [("$2.8B", "Client Revenue"), ("500M+", "Reach"), ("3.2x", "ROAS")],
        "kpis": [
            ("Audience Reach", "500M+", "+35%", 0.88, "\u2191"),
            ("Engagement Rate", "4.8%", "+1.2%", 0.72, "\u2191"),
            ("Campaign ROAS", "3.2x", "+0.8x", 0.80, "\u2191"),
            ("Brand Lift", "+18%", "+3pts", 0.68, "\u2191"),
        ],
        "swot": {
            "strengths": ["Award-winning creative team", "Full-service capabilities", "Strong client relationships"],
            "weaknesses": ["Dependent on key creatives", "Limited international presence", "Project-based revenue"],
            "opportunities": ["AI content creation tools", "Short-form video explosion", "Creator economy partnerships"],
            "threats": ["In-house agency trend", "Ad spend recession", "Platform algorithm changes"],
        },
        "pillars": [
            ("Brand Strategy", "Positioning, identity systems, and go-to-market playbooks that win."),
            ("Content Studio", "Video, social, and editorial content at scale with studio-quality craft."),
            ("Performance", "Paid media, SEO, and CRO that turn awareness into measurable revenue."),
        ],
        "quote_text": (
            "The best marketing doesn't feel like marketing. It feels like a story worth sharing, "
            "an experience worth remembering, a brand worth believing in."
        ),
        "quote_attribution": "Chief Creative Officer, Prism Media",
        "quote_source": "Cannes Lions Acceptance Speech, 2025",
        "cta_headline": "Let's Create\nSomething Iconic",
        "cta_subtitle": "Ready to elevate your brand? Let's discuss how our creative team can drive your next breakthrough.",
    })
    return c


def _academic_theme() -> TemplateTheme:
    from pptmaster.builder.ux_styles import SCHOLARLY
    return TemplateTheme(
        key="academic", company_name="University", industry="Academic",
        tagline="Excellence in Education & Research",
        primary="#1E3A5F", accent="#9B2335", secondary="#4A5568", light_bg="#FAF9F6",
        palette=["#2563EB", "#E85D04", "#2D6A4F", "#7C5CBF", "#C27D38", "#DC2626"],
        font="Georgia",
        ux_style=SCHOLARLY,
        content=_academic_content(),
    )


def _research_theme() -> TemplateTheme:
    from pptmaster.builder.ux_styles import LABORATORY
    return TemplateTheme(
        key="research", company_name="Research Institute", industry="Research / Scientific",
        tagline="Advancing Knowledge Through Discovery",
        primary="#0D4F4F", accent="#D97706", secondary="#64748B", light_bg="#F8FAFC",
        palette=["#2563EB", "#E11D48", "#7C3AED", "#059669", "#DC2626", "#F59E0B"],
        font="Calibri",
        ux_style=LABORATORY,
        content=_research_content(),
    )


def _report_theme() -> TemplateTheme:
    from pptmaster.builder.ux_styles import DASHBOARD
    return TemplateTheme(
        key="report", company_name="Analytics Group", industry="Reports / Analysis",
        tagline="Data-Driven Insights",
        primary="#1F2937", accent="#0891B2", secondary="#6B7280", light_bg="#F9FAFB",
        palette=["#2563EB", "#E11D48", "#7C3AED", "#DC2626", "#059669", "#D97706"],
        font="Segoe UI",
        ux_style=DASHBOARD,
        content=_report_content(),
    )


def _academic_content() -> dict:
    c = _corporate_content("University")
    c.update({
        "cover_title": "Research & Academic Excellence",
        "cover_subtitle": "Advancing Knowledge Through Scholarship",
        "overview_mission": (
            "Our institution is committed to the pursuit of knowledge, academic excellence, "
            "and the development of scholars who will shape the future.\n\n"
            "Through rigorous research and innovative teaching, we prepare leaders for a complex world."
        ),
        "overview_facts": [("Founded", "1870"), ("Students", "45,000+"), ("Faculty", "3,200"), ("Endowment", "$8.5B")],
        "values": [
            ("Academic Freedom", "We protect the open exchange of ideas and intellectual inquiry."),
            ("Research Excellence", "We pursue discovery that transforms understanding and improves lives."),
            ("Inclusivity", "We foster a diverse community where every voice is valued."),
            ("Integrity", "We uphold the highest ethical standards in scholarship and governance."),
        ],
        "key_facts": [
            ("$8.5B", "Endowment"), ("45,000+", "Students"), ("3,200", "Faculty"),
            ("280+", "Degree Programs"), ("$1.2B", "Research Funding"), ("Top 20", "Global Ranking"),
        ],
        "exec_metrics": [("$1.2B", "Research Funding"), ("Top 20", "World Ranking"), ("98%", "Graduation Rate")],
        "kpis": [
            ("Research Output", "4,200", "+12%", 0.85, "\u2191"),
            ("Student Satisfaction", "4.6/5", "+0.3", 0.92, "\u2191"),
            ("Grant Success Rate", "38%", "+5%", 0.76, "\u2191"),
            ("Alumni Employment", "96%", "+2%", 0.96, "\u2191"),
        ],
        "swot": {
            "strengths": ["World-class faculty", "Strong research output", "Diverse student body"],
            "weaknesses": ["Aging infrastructure", "Administrative complexity", "Tuition dependence"],
            "opportunities": ["Online learning expansion", "Industry partnerships", "Interdisciplinary programs"],
            "threats": ["Declining enrollment trends", "Government funding cuts", "Global competition"],
        },
        "pillars": [
            ("Research", "Pioneering discoveries across natural sciences, humanities, and engineering."),
            ("Teaching", "Student-centered learning with world-renowned faculty and mentorship."),
            ("Community", "Engagement and outreach that extend our impact beyond campus walls."),
        ],
        "quote_text": (
            "Education is not the filling of a pail, but the lighting of a fire. "
            "Our mission is to ignite curiosity and empower the next generation of thinkers."
        ),
        "quote_attribution": "President, University",
        "quote_source": "Annual Convocation Address, 2025",
        "cta_headline": "Advancing Knowledge\nTogether",
        "cta_subtitle": "Join us in shaping the future through research, teaching, and innovation.",
    })
    return c


def _research_content() -> dict:
    c = _corporate_content("Research Institute")
    c.update({
        "cover_title": "Frontiers of Scientific Discovery",
        "cover_subtitle": "Advancing Knowledge Through Rigorous Research",
        "overview_mission": (
            "The Research Institute is dedicated to expanding the boundaries of human knowledge "
            "through rigorous, ethical, and innovative scientific inquiry.\n\n"
            "Our multidisciplinary teams tackle the world's most pressing challenges."
        ),
        "overview_facts": [("Established", "1998"), ("Researchers", "850+"), ("Publications/Year", "2,400"), ("Grants", "$420M")],
        "values": [
            ("Scientific Rigor", "Every finding is peer-reviewed, replicated, and transparently reported."),
            ("Collaboration", "We bridge disciplines and institutions to accelerate discovery."),
            ("Open Science", "We share data, methods, and tools to advance collective knowledge."),
            ("Impact", "We translate research into solutions for real-world problems."),
        ],
        "key_facts": [
            ("$420M", "Annual Grants"), ("850+", "Researchers"), ("2,400", "Publications/Year"),
            ("45", "Active Labs"), ("12", "Patents Filed"), ("92%", "Peer-Review Rate"),
        ],
        "exec_metrics": [("$420M", "Grant Funding"), ("2,400", "Publications"), ("H-index 85", "Impact")],
        "kpis": [
            ("Citations", "48,000", "+18%", 0.88, "\u2191"),
            ("Grant Win Rate", "42%", "+6%", 0.84, "\u2191"),
            ("Publication Rate", "2,400/yr", "+15%", 0.80, "\u2191"),
            ("Collaboration Index", "3.8", "+0.4", 0.76, "\u2191"),
        ],
        "swot": {
            "strengths": ["World-class instrumentation", "Cross-disciplinary expertise", "Strong publication record"],
            "weaknesses": ["Funding cycle dependency", "Researcher retention", "Admin overhead"],
            "opportunities": ["AI-assisted research tools", "International partnerships", "Industry co-funding"],
            "threats": ["Budget austerity measures", "Data reproducibility crisis", "Talent competition"],
        },
        "pillars": [
            ("Discovery", "Fundamental research that pushes the frontiers of human understanding."),
            ("Translation", "Converting findings into applications, therapies, and technologies."),
            ("Training", "Developing the next generation of scientists through mentorship and rigor."),
        ],
        "quote_text": (
            "Science is not just a body of knowledge — it is a way of thinking. "
            "Our commitment is to follow the evidence wherever it leads."
        ),
        "quote_attribution": "Director, Research Institute",
        "quote_source": "Nature Editorial, 2025",
        "cta_headline": "Discover\nWhat's Next",
        "cta_subtitle": "Partner with us on groundbreaking research that shapes the future.",
    })
    return c


def _report_content() -> dict:
    c = _corporate_content("Analytics Group")
    c.update({
        "cover_title": "Strategic Analysis Report",
        "cover_subtitle": "Data-Driven Insights for Informed Decisions",
        "overview_mission": (
            "Analytics Group delivers actionable intelligence and strategic analysis to help "
            "organizations make data-driven decisions with confidence.\n\n"
            "We combine quantitative rigor with industry expertise to illuminate what matters most."
        ),
        "overview_facts": [("Founded", "2012"), ("Analysts", "500+"), ("Reports/Year", "1,200"), ("Clients", "350+")],
        "values": [
            ("Objectivity", "Every analysis is grounded in data, free from bias or agenda."),
            ("Precision", "We pursue accuracy and rigor in every metric and model."),
            ("Clarity", "Complex insights delivered in clear, actionable formats."),
            ("Timeliness", "Decisions can't wait — our analysis is delivered when it matters."),
        ],
        "key_facts": [
            ("1,200", "Reports/Year"), ("500+", "Analysts"), ("350+", "Clients"),
            ("$2.4B", "Decisions Influenced"), ("99.2%", "Data Accuracy"), ("4.9/5", "Client Rating"),
        ],
        "exec_metrics": [("1,200", "Annual Reports"), ("$2.4B", "Decisions Influenced"), ("99.2%", "Accuracy")],
        "kpis": [
            ("Report Volume", "1,200", "+22%", 0.85, "\u2191"),
            ("Client Satisfaction", "4.9/5", "+0.2", 0.98, "\u2191"),
            ("Data Accuracy", "99.2%", "+0.3%", 0.99, "\u2191"),
            ("Turnaround Time", "3.2 days", "-0.8d", 0.80, "\u2193"),
        ],
        "swot": {
            "strengths": ["Deep analytical expertise", "Proprietary data assets", "Strong client trust"],
            "weaknesses": ["Manual data collection", "Scaling limitations", "Niche market focus"],
            "opportunities": ["AI/ML automation", "Real-time analytics", "Subscription model expansion"],
            "threats": ["Self-service BI tools", "Data privacy regulation", "Commoditization of reports"],
        },
        "pillars": [
            ("Analytics", "Quantitative models, statistical analysis, and machine learning insights."),
            ("Strategy", "Market intelligence and competitive analysis for informed decision-making."),
            ("Visualization", "Interactive dashboards and reports that make complex data accessible."),
        ],
        "quote_text": (
            "In God we trust; all others must bring data. "
            "Our mission is to transform information into intelligence that drives results."
        ),
        "quote_attribution": "Managing Director, Analytics Group",
        "quote_source": "Annual Industry Conference, 2025",
        "cta_headline": "Insights That\nDrive Action",
        "cta_subtitle": "Let our analytical expertise inform your next strategic decision.",
    })
    return c


# ── Public API ─────────────────────────────────────────────────────────

DEFAULT_THEME = _default_theme()

ALL_THEMES: list[TemplateTheme] = [
    _healthcare_theme(),
    _technology_theme(),
    _finance_theme(),
    _education_theme(),
    _sustainability_theme(),
    _luxury_theme(),
    _startup_theme(),
    _government_theme(),
    _realestate_theme(),
    _creative_theme(),
    _academic_theme(),
    _research_theme(),
    _report_theme(),
]

THEME_MAP: dict[str, TemplateTheme] = {t.key: t for t in [DEFAULT_THEME] + ALL_THEMES}


def get_theme(key: str = "corporate") -> TemplateTheme:
    """Get a theme by its key name."""
    return THEME_MAP[key]
