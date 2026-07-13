# Deploying the Frontend to Vercel

This guide explains how to deploy the Next.js frontend application of the Tutor and Professor project to Vercel.

Vercel is a cloud platform for frontend frameworks and static sites, ideal for Next.js applications due to its seamless integration and performance optimizations.

## Prerequisites

*   A Vercel account. You can sign up for free at [vercel.com](https://vercel.com/).
*   Your project repository hosted on GitHub, GitLab, or Bitbucket.

## Step-by-Step Deployment

### 1. Link Your Git Repository to Vercel

1.  Go to your [Vercel Dashboard](https://vercel.com/dashboard).
2.  Click on the **"Add New..."** button and select **"Project"**.
3.  Choose your Git provider (GitHub, GitLab, or Bitbucket) and authorize Vercel if you haven't already.
4.  Select the `english-kids-tutor` repository from your list of repositories.

### 2. Configure the Project

After selecting the repository, Vercel will prompt you to configure your project. It usually auto-detects Next.js, but you need to specify the correct root directory for the frontend application.

1.  **Root Directory**: Click on **"Edit"** next to the Root Directory field and set it to `apps/web`.
2.  **Framework Preset**: Vercel should automatically detect **"Next.js"**.
3.  **Build and Output Settings**: You can leave these as default unless you have specific requirements.

### 3. Set Environment Variables

This is a crucial step to ensure your frontend can communicate with your backend API.

1.  In the project configuration screen, navigate to the **"Environment Variables"** section.
2.  Add a new environment variable:
    *   **Name**: `NEXT_PUBLIC_API_BASE_URL`
    *   **Value**: This should be the public URL of your backend API. If you are using Cloudflare Tunnel to expose your local backend, this would be your Cloudflare Tunnel public hostname (e.g., `https://api.yourdomain.com`). If your backend is deployed elsewhere, use that URL.

    **Example:**
    ```
    NEXT_PUBLIC_API_BASE_URL=https://api.yourdomain.com
    ```

    **Important**: Ensure this URL is accessible from the internet.

### 4. Deploy

1.  Once all configurations are set, click the **"Deploy"** button.
2.  Vercel will now build and deploy your Next.js application. You can monitor the deployment progress in the Vercel dashboard.
3.  Upon successful deployment, Vercel will provide you with a unique URL for your live frontend application.

## Post-Deployment

*   **Custom Domains**: You can add custom domains to your Vercel project from the project settings.
*   **Continuous Deployment**: Vercel automatically deploys new changes every time you push to your connected Git branch (e.g., `main`).
*   **Troubleshooting**: If you encounter any issues, check the deployment logs in your Vercel dashboard for error messages.

By following these steps, your Tutor and Professor frontend will be live and accessible to users!
