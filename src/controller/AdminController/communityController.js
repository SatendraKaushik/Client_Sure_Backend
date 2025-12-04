import Feedback from '../../models/Feedback.js';
import User from '../../models/User.js';

// Get all posts for admin moderation
export const getAllPostsAdmin = async (req, res) => {
  try {
    console.log('Admin community request received');
    console.log('Admin user:', req.admin);
    
    const posts = await Feedback.find()
      .populate('user_id', 'name email avatar')
      .populate('comments.user_id', 'name email avatar')
      .sort({ createdAt: -1 });

    console.log(`Found ${posts.length} posts for admin`);
    
    res.status(200).json({ 
      success: true,
      posts: posts,
      count: posts.length
    });
  } catch (error) {
    console.error('Error in getAllPostsAdmin:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching posts', 
      error: error.message 
    });
  }
};

// Admin delete any post
export const deletePostAdmin = async (req, res) => {
  try {
    const { postId } = req.params;
    console.log('Admin deleting post:', postId);

    const post = await Feedback.findById(postId).populate('user_id', 'name email');
    if (!post) {
      return res.status(404).json({ 
        success: false,
        message: 'Post not found' 
      });
    }

    const postOwnerId = post.user_id._id;
    const postOwnerName = post.user_id.name;
    
    // Get all unique commenters before deleting the post
    const commenters = [...new Set(post.comments.map(comment => comment.user_id.toString()))];
    const totalComments = post.comments.length;
    
    console.log(`Admin deleting post by ${postOwnerName} with ${totalComments} comments from ${commenters.length} unique users`);

    // Delete the post
    await Feedback.findByIdAndDelete(postId);

    // Deduct points from post owner
    await User.findByIdAndUpdate(postOwnerId, {
      $inc: { 
        points: -5,
        'communityActivity.postsCreated': -1
      }
    });

    // Deduct points from all commenters (2 points per comment)
    if (commenters.length > 0) {
      const commenterUpdates = commenters.map(async (commenterId) => {
        // Count how many comments this user made on this post
        const userCommentCount = post.comments.filter(
          comment => comment.user_id.toString() === commenterId
        ).length;
        
        const pointsToDeduct = userCommentCount * 2;
        
        console.log(`Admin deducting ${pointsToDeduct} points from user ${commenterId} for ${userCommentCount} comments`);
        
        return User.findByIdAndUpdate(commenterId, {
          $inc: { 
            points: -pointsToDeduct,
            'communityActivity.commentsMade': -userCommentCount
          }
        });
      });

      await Promise.all(commenterUpdates);
      console.log(`Points deducted from ${commenters.length} commenters`);
    }

    console.log('Post deleted and all points deducted');
    res.json({ 
      success: true,
      message: `Post deleted successfully. Points deducted from ${postOwnerName} and ${commenters.length} commenters`,
      details: {
        commentsDeleted: totalComments,
        usersAffected: commenters.length + 1
      }
    });
  } catch (error) {
    console.error('Error deleting post:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error deleting post', 
      error: error.message 
    });
  }
};

// Admin delete any comment
export const deleteCommentAdmin = async (req, res) => {
  try {
    const { commentId } = req.params;
    console.log('Admin deleting comment:', commentId);

    const post = await Feedback.findOne({ 'comments._id': commentId })
      .populate('comments.user_id', 'name email');
    
    if (!post) {
      return res.status(404).json({ 
        success: false,
        message: 'Comment not found' 
      });
    }

    const comment = post.comments.id(commentId);
    const commentOwnerId = comment.user_id._id;
    const commentOwnerName = comment.user_id.name;
    
    console.log(`Deleting comment by ${commentOwnerName} (${commentOwnerId})`);

    // Remove comment
    post.comments.pull(commentId);
    await post.save();

    // Deduct points from comment owner
    await User.findByIdAndUpdate(commentOwnerId, {
      $inc: { 
        points: -2,
        'communityActivity.commentsMade': -1
      }
    });

    console.log('Comment deleted and points deducted');
    res.json({ 
      success: true,
      message: `Comment deleted successfully. 2 points deducted from ${commentOwnerName}` 
    });
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error deleting comment', 
      error: error.message 
    });
  }
};

// Admin get leaderboard (no subscription check)
export const getLeaderboardAdmin = async (req, res) => {
  try {
    console.log('Admin fetching leaderboard...');
    
    const leaderboard = await User.find({ points: { $gt: 0 } })
      .select('name avatar points communityActivity')
      .sort({ points: -1 })
      .limit(50);

    console.log(`Found ${leaderboard.length} users in leaderboard`);
    res.json({ 
      success: true,
      leaderboard, 
      count: leaderboard.length 
    });
  } catch (error) {
    console.error('Error fetching admin leaderboard:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching leaderboard', 
      error: error.message 
    });
  }
};

// Admin get community stats (no subscription check)
export const getCommunityStatsAdmin = async (req, res) => {
  try {
    console.log('Admin fetching community stats...');
    
    const stats = await Promise.all([
      Feedback.countDocuments(),
      Feedback.aggregate([{ $unwind: '$comments' }, { $count: 'total' }]),
      Feedback.aggregate([{ $unwind: '$likes' }, { $count: 'total' }]),
      User.countDocuments({ points: { $gt: 0 } })
    ]);

    const result = {
      totalPosts: stats[0],
      totalComments: stats[1][0]?.total || 0,
      totalLikes: stats[2][0]?.total || 0,
      activeMembers: stats[3]
    };
    
    console.log('Community stats:', result);
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error fetching admin community stats:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching community stats', 
      error: error.message 
    });
  }
};

// Fix leaderboard sync
export const fixLeaderboardSync = async (req, res) => {
  try {
    console.log('Admin fixing leaderboard sync...');
    
    const users = await User.find({});
    let fixedCount = 0;

    for (const user of users) {
      const userPosts = await Feedback.find({ user_id: user._id });
      const userComments = await Feedback.find({ 'comments.user_id': user._id });
      const userLikes = await Feedback.find({ 'likes.user_id': user._id });

      let totalComments = 0;
      for (const post of userComments) {
        totalComments += post.comments.filter(comment => 
          comment.user_id.toString() === user._id.toString()
        ).length;
      }

      const correctPoints = (userPosts.length * 5) + (totalComments * 2) + (userLikes.length * 1);

      if (user.points !== correctPoints) {
        await User.findByIdAndUpdate(user._id, {
          points: correctPoints,
          'communityActivity.postsCreated': userPosts.length,
          'communityActivity.commentsMade': totalComments,
          'communityActivity.likesGiven': userLikes.length
        });
        fixedCount++;
      }
    }

    res.json({
      success: true,
      message: `Leaderboard sync completed. Fixed ${fixedCount} users.`,
      usersProcessed: users.length,
      usersFixed: fixedCount
    });
  } catch (error) {
    console.error('Error fixing leaderboard sync:', error);
    res.status(500).json({
      success: false,
      message: 'Error fixing leaderboard sync',
      error: error.message
    });
  }
};